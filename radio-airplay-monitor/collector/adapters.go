package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	_ "time/tzdata" // embed the IANA tz database so timezone lookups work on any host
)

// Polite, identifiable UA so station operators can see who we are.
const userAgent = "airmon/0.2 (open radio airplay monitor; +https://github.com/HudsonGraeme/airmon)"

// fetchMode declares how an adapter's output should be deduplicated. It lives with
// the adapter (not the station) because it's a property of the upstream feed.
type fetchMode int

const (
	// modeTimestamped: the feed returns a timestamped recent-history window, so we
	// keep everything strictly newer than the per-station cursor. Deeper
	// history_fetch closes the gap when polls slip.
	modeTimestamped fetchMode = iota
	// modeCurrent: the feed returns only the current track with no server time, so
	// we stamp with poll time and collapse unchanged repeats via last_key.
	modeCurrent
)

// adapter is one source type. Register a new broadcaster feed by adding an entry
// to the registry below — no changes to the main loop required.
type adapter struct {
	fetch func(st Station, eff Strategy) ([]Spin, error)
	mode  fetchMode
}

// registry maps a station's "adapter" key to its implementation.
var registry = map[string]adapter{
	"triton":  {fetch: fetchTritonAdapter, mode: modeTimestamped},
	"streamb": {fetch: fetchStreamBAdapter, mode: modeCurrent},
	"corus":   {fetch: fetchCorusAdapter, mode: modeTimestamped},
}

func fetchTritonAdapter(st Station, eff Strategy) ([]Spin, error) {
	n := eff.HistoryFetch
	if n <= 0 {
		n = 10
	}
	return fetchTriton(st, n)
}

func fetchStreamBAdapter(st Station, _ Strategy) ([]Spin, error) {
	return fetchStreamB(st)
}

func fetchCorusAdapter(st Station, _ Strategy) ([]Spin, error) {
	return fetchCorus(st)
}

var httpClient = &http.Client{Timeout: 15 * time.Second}

func httpGet(u string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// --- Triton Digital (Bell Media / iHeartRadio Canada) ---
// Returns timestamped recent history, so we never miss a spin between polls.

type tritonList struct {
	Infos []tritonInfo `xml:"nowplaying-info"`
}
type tritonInfo struct {
	Timestamp string       `xml:"timestamp,attr"`
	Props     []tritonProp `xml:"property"`
}
type tritonProp struct {
	Name  string `xml:"name,attr"`
	Value string `xml:",chardata"`
}

func fetchTriton(st Station, n int) ([]Spin, error) {
	q := url.Values{}
	q.Set("mountName", st.Mount)
	q.Set("numberToFetch", strconv.Itoa(n))
	q.Set("eventType", "track")
	body, err := httpGet("https://np.tritondigital.com/public/nowplaying?" + q.Encode())
	if err != nil {
		return nil, err
	}
	var list tritonList
	if err := xml.Unmarshal(body, &list); err != nil {
		return nil, err
	}
	var out []Spin
	for _, info := range list.Infos {
		m := make(map[string]string, len(info.Props))
		for _, p := range info.Props {
			m[p.Name] = strings.TrimSpace(p.Value)
		}
		artist, title := m["track_artist_name"], m["cue_title"]
		if artist == "" || title == "" {
			continue
		}
		var at int64
		if v := m["cue_time_start"]; v != "" { // milliseconds
			if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
				at = ms / 1000
			}
		}
		if at == 0 {
			if ts, err := strconv.ParseInt(info.Timestamp, 10, 64); err == nil {
				at = ts
			}
		}
		if at == 0 {
			at = time.Now().Unix()
		}
		out = append(out, Spin{Station: st.ID, Artist: artist, Title: title, At: at, Src: "triton"})
	}
	return out, nil
}

// --- StreamB / leanplayer (Evanov Communications) ---
// Returns only the current track, no server timestamp. We stamp with poll time
// and the caller collapses unchanged repeats.

func fetchStreamB(st Station) ([]Spin, error) {
	body, err := httpGet(st.URL)
	if err != nil {
		return nil, err
	}
	var d struct {
		Artist string `json:"artist"`
		Title  string `json:"title"`
	}
	if err := json.Unmarshal(body, &d); err != nil {
		return nil, err
	}
	a, t := strings.TrimSpace(d.Artist), strings.TrimSpace(d.Title)
	if a == "" || t == "" {
		return nil, nil
	}
	return []Spin{{Station: st.ID, Artist: a, Title: t, At: time.Now().Unix(), Src: "streamb"}}, nil
}

// --- Corus Entertainment (Global News / Corus Radio) ---
// Corus stations publish a JSONP recent-history feed on S3. Each song carries a
// time-of-day string in the station's LOCAL timezone (no date, no zone), so we
// reconstruct a full UTC timestamp from the station's province.

// provTZ maps a Canadian province/territory code to its IANA timezone. Radio
// markets sit in a single zone per province for our purposes (we don't monitor
// the split-zone edges), so a per-province lookup is exact enough to timestamp.
var provTZ = map[string]string{
	"NL": "America/St_Johns",
	"NS": "America/Halifax",
	"PE": "America/Halifax",
	"NB": "America/Moncton",
	"QC": "America/Toronto",
	"ON": "America/Toronto",
	"MB": "America/Winnipeg",
	"SK": "America/Regina",
	"AB": "America/Edmonton",
	"BC": "America/Vancouver",
	"YT": "America/Whitehorse",
	"NT": "America/Yellowknife",
	"NU": "America/Iqaluit",
}

func stationLocation(st Station) *time.Location {
	name := provTZ[strings.ToUpper(strings.TrimSpace(st.Prov))]
	if name == "" {
		name = "America/Toronto" // Corus is Toronto-headquartered; safe default
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

func fetchCorus(st Station) ([]Spin, error) {
	u := "https://globalnewselection.s3.amazonaws.com/fm-playlist/results/" + st.Mount + "_pl.js"
	body, err := httpGet(u)
	if err != nil {
		return nil, err
	}
	// Strip the JSONP wrapper: plCallback({...}).
	s := string(body)
	i := strings.Index(s, "(")
	j := strings.LastIndex(s, ")")
	if i < 0 || j <= i {
		return nil, fmt.Errorf("corus: unexpected payload")
	}
	var d struct {
		Songs []struct {
			Artist string `json:"artist"`
			Song   string `json:"song"`
			Date   string `json:"date"`
		} `json:"songs"`
	}
	if err := json.Unmarshal([]byte(s[i+1:j]), &d); err != nil {
		return nil, err
	}
	loc := stationLocation(st)
	now := time.Now().In(loc)
	var out []Spin
	for _, sg := range d.Songs {
		a, t := strings.TrimSpace(sg.Artist), strings.TrimSpace(sg.Song)
		if a == "" || t == "" {
			continue
		}
		at := time.Now().Unix()
		if tod, err := time.ParseInLocation("03:04PM", strings.TrimSpace(sg.Date), loc); err == nil {
			ts := time.Date(now.Year(), now.Month(), now.Day(), tod.Hour(), tod.Minute(), 0, 0, loc)
			// The feed is a short recent-history window (~10 songs spanning a
			// couple hours), so a wall-clock time far in the future can only mean
			// it wrapped past midnight — that song is yesterday. A small future
			// offset instead means the station's playout clock runs a little fast;
			// keep it on today rather than flinging the spin ~24h into the past.
			if ts.Sub(now) > 12*time.Hour {
				ts = ts.AddDate(0, 0, -1)
			}
			at = ts.Unix()
		}
		out = append(out, Spin{Station: st.ID, Artist: a, Title: t, At: at, Src: "corus"})
	}
	return out, nil
}
