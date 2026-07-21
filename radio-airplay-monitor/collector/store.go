package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Strategy is the set of per-station capture knobs. Every field is optional and
// resolved by precedence (built-in defaults < config "defaults" < a station's own
// "strategy"), so a station only names what it needs to override. The goal of the
// knobs is data completeness: fetch deep enough that a slipping poll interval
// never drops spins, and retry transient failures rather than losing a whole poll.
type Strategy struct {
	HistoryFetch   int   `json:"history_fetch,omitempty"`    // timestamped adapters: rows to pull per poll
	MaxRetries     int   `json:"max_retries,omitempty"`      // extra attempts after the first on fetch error
	RetryBackoffMs int   `json:"retry_backoff_ms,omitempty"` // base backoff between attempts (scales per attempt)
	SampleWindowS  int   `json:"sample_window_s,omitempty"`  // current-track adapters: keep sampling for this many seconds per run
	SampleEveryS   int   `json:"sample_every_s,omitempty"`   // interval between samples within the window
	Enabled        *bool `json:"enabled,omitempty"`          // nil/true = polled; false = skipped this run
}

// builtinStrategy is the last-resort fallback when neither the config "defaults"
// nor a station's "strategy" set a field.
var builtinStrategy = Strategy{HistoryFetch: 10, MaxRetries: 2, RetryBackoffMs: 500, SampleEveryS: 20}

// merge overlays any set (non-zero / non-nil) field of over onto base.
func (base Strategy) merge(over Strategy) Strategy {
	if over.HistoryFetch > 0 {
		base.HistoryFetch = over.HistoryFetch
	}
	if over.MaxRetries > 0 {
		base.MaxRetries = over.MaxRetries
	}
	if over.RetryBackoffMs > 0 {
		base.RetryBackoffMs = over.RetryBackoffMs
	}
	if over.SampleWindowS > 0 {
		base.SampleWindowS = over.SampleWindowS
	}
	if over.SampleEveryS > 0 {
		base.SampleEveryS = over.SampleEveryS
	}
	if over.Enabled != nil {
		base.Enabled = over.Enabled
	}
	return base
}

func (s Strategy) enabled() bool { return s.Enabled == nil || *s.Enabled }

// Station is one monitored broadcast station.
type Station struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Market  string `json:"market"`
	Owner   string `json:"owner"`
	Format  string `json:"format"`
	Adapter string `json:"adapter"`         // registry key, e.g. "triton" | "streamb" | "corus"
	Mount   string `json:"mount,omitempty"` // triton mount name; corus call sign (e.g. "CILQFM")
	URL     string `json:"url,omitempty"`   // streamb endpoint
	Prov    string `json:"prov,omitempty"`  // province code (ON, BC, ...); used to resolve local timezone

	Strategy     *Strategy `json:"strategy,omitempty"`      // per-station overrides
	HistoryFetch int       `json:"history_fetch,omitempty"` // deprecated: use strategy.history_fetch
}

// resolve computes the effective strategy for a station.
func (cfg *Config) resolve(st Station) Strategy {
	eff := builtinStrategy.merge(cfg.Defaults)
	if st.HistoryFetch > 0 { // back-compat with the old top-level field
		eff.HistoryFetch = st.HistoryFetch
	}
	if st.Strategy != nil {
		eff = eff.merge(*st.Strategy)
	}
	return eff
}

// Config is data/stations.json.
type Config struct {
	Defaults           Strategy  `json:"defaults"`
	TritonHistoryFetch int       `json:"triton_history_fetch,omitempty"` // deprecated: use defaults.history_fetch
	Stations           []Station `json:"stations"`
}

// Spin is one logged play. Field names are short because we store millions of
// these as NDJSON: s=station id, a=artist, t=title, at=unix seconds, src=adapter.
type Spin struct {
	Station string `json:"s"`
	Artist  string `json:"a"`
	Title   string `json:"t"`
	At      int64  `json:"at"`
	Src     string `json:"src"`
}

// StationState is per-station cursor used to avoid re-appending known spins.
type StationState struct {
	MaxAt   int64  `json:"max_at"`   // newest played_at we've stored (timestamped sources)
	LastKey string `json:"last_key"` // last artist|title seen (current-track sources)
}

func loadConfig(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, err
	}
	// Fold the deprecated top-level field into defaults if defaults is unset.
	if c.Defaults.HistoryFetch == 0 && c.TritonHistoryFetch > 0 {
		c.Defaults.HistoryFetch = c.TritonHistoryFetch
	}
	return &c, nil
}

func loadState(path string) (map[string]StationState, error) {
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]StationState{}, nil
	}
	if err != nil {
		return nil, err
	}
	m := map[string]StationState{}
	if len(b) == 0 {
		return m, nil
	}
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return m, nil
}

func saveState(path string, m map[string]StationState) error {
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0644)
}

func normKey(artist, title string) string {
	return strings.ToLower(strings.TrimSpace(artist)) + "|" + strings.ToLower(strings.TrimSpace(title))
}

// Store appends spins to month-partitioned NDJSON files under data/spins/.
type Store struct{ dir string }

func NewStore(dataDir string) *Store { return &Store{dir: filepath.Join(dataDir, "spins")} }

func (s *Store) Append(spins []Spin) error {
	if err := os.MkdirAll(s.dir, 0755); err != nil {
		return err
	}
	byMonth := map[string][]Spin{}
	for _, sp := range spins {
		month := time.Unix(sp.At, 0).UTC().Format("2006-01")
		byMonth[month] = append(byMonth[month], sp)
	}
	for month, list := range byMonth {
		path := filepath.Join(s.dir, month+".ndjson")
		f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return err
		}
		enc := json.NewEncoder(f)
		for _, sp := range list {
			if err := enc.Encode(sp); err != nil {
				f.Close()
				return err
			}
		}
		if err := f.Close(); err != nil {
			return err
		}
	}
	return nil
}
