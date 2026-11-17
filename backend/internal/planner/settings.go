package planner

import (
	"context"
	"log"
)

// Settings belong to the whole installation, not to one project.
type Settings struct {
	// What happens when a new standard project is created while another is still being built:
	// "off" (nothing), "warn" (a notice in the dialog) or "block" (refused).
	OneBuildMode string `json:"one_build_mode"`
	// Automatic daily backup of the database and the uploads, and how many to keep.
	BackupEnabled bool `json:"backup_enabled"`
	BackupKeep    int  `json:"backup_keep"`
}

func defaultSettings() Settings {
	return Settings{OneBuildMode: "warn", BackupEnabled: true, BackupKeep: 7}
}

const settingsKey = "app"

// Settings returns the saved settings, or the defaults when nothing was saved yet.
func (s *Service) Settings(ctx context.Context) Settings {
	st := defaultSettings()
	if _, err := s.store.GetSetting(ctx, settingsKey, &st); err != nil {
		log.Printf("settings: %v", err)
		return defaultSettings()
	}
	return st
}

// SettingsPatch changes some settings; nil means "leave as is".
type SettingsPatch struct {
	OneBuildMode  *string `json:"one_build_mode"`
	BackupEnabled *bool   `json:"backup_enabled"`
	BackupKeep    *int    `json:"backup_keep"`
}

func (s *Service) UpdateSettings(ctx context.Context, in SettingsPatch) (Settings, error) {
	st := s.Settings(ctx)
	if in.OneBuildMode != nil {
		if !oneOf(*in.OneBuildMode, "off", "warn", "block") {
			return st, invalid("The one-project rule is off, warn or block.")
		}
		st.OneBuildMode = *in.OneBuildMode
	}
	if in.BackupEnabled != nil {
		st.BackupEnabled = *in.BackupEnabled
	}
	if in.BackupKeep != nil {
		if *in.BackupKeep < 1 || *in.BackupKeep > 365 {
			return st, invalid("Keep between 1 and 365 automatic backups.")
		}
		st.BackupKeep = *in.BackupKeep
	}
	return st, s.store.SetSetting(ctx, settingsKey, st)
}
