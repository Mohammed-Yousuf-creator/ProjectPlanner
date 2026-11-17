// Package gitlog is a black box that reads recent commit activity from a local git repository.
// It only ever runs read-only git commands, without a shell.
package gitlog

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Commit struct {
	Hash    string    `json:"hash"`
	Subject string    `json:"subject"`
	At      time.Time `json:"at"`
	// Task numbers the message mentions ("#12"), and the ones it says are finished
	// ("closes #12", "fixes #12", "done #12").
	Refs   []int64 `json:"refs"`
	Closes []int64 `json:"closes"`
}

var (
	refRe   = regexp.MustCompile(`(?:^|[^\w&#])#(\d{1,12})\b`)
	closeRe = regexp.MustCompile(`(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|done|finish(?:e[sd])?)\s*:?\s+#(\d{1,12})\b`)
)

// ParseRefs finds the task numbers a commit message mentions and the ones it closes.
func ParseRefs(message string) (refs, closes []int64) {
	collect := func(re *regexp.Regexp) []int64 {
		out := []int64{}
		seen := map[int64]bool{}
		for _, m := range re.FindAllStringSubmatch(message, -1) {
			if n, err := strconv.ParseInt(m[1], 10, 64); err == nil && n > 0 && !seen[n] {
				seen[n] = true
				out = append(out, n)
			}
		}
		return out
	}
	return collect(refRe), collect(closeRe)
}

type Info struct {
	Configured bool     `json:"configured"`
	OK         bool     `json:"ok"`
	Error      string   `json:"error,omitempty"`
	Path       string   `json:"path"`
	Branch     string   `json:"branch"`
	Dirty      int      `json:"dirty"` // files with uncommitted changes
	Commits    []Commit `json:"commits"`
}

// ExpandPath turns "~/code/app" into an absolute path.
func ExpandPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "~" || strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			p = filepath.Join(home, strings.TrimPrefix(p, "~"))
		}
	}
	return p
}

// Read returns the latest commits (newest first) of the repository at path.
func Read(ctx context.Context, path string, limit int) Info {
	info := Info{Path: path, Commits: []Commit{}}
	if strings.TrimSpace(path) == "" {
		return info
	}
	info.Configured = true
	if limit <= 0 {
		limit = 100
	}
	dir := ExpandPath(path)
	if !filepath.IsAbs(dir) {
		info.Error = "Use an absolute path, for example /home/you/code/my-project."
		return info
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		info.Error = "That folder does not exist yet. Create the project skeleton, then come back."
		return info
	}
	if _, err := exec.LookPath("git"); err != nil {
		info.Error = "git is not installed (sudo apt install git)."
		return info
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if out, err := git(ctx, dir, "rev-parse", "--is-inside-work-tree"); err != nil || strings.TrimSpace(out) != "true" {
		info.Error = "That folder is not a git repository yet. Run `git init` in it."
		return info
	}
	info.OK = true
	if out, err := git(ctx, dir, "symbolic-ref", "--short", "-q", "HEAD"); err == nil {
		info.Branch = strings.TrimSpace(out)
	}
	if out, err := git(ctx, dir, "status", "--porcelain"); err == nil {
		for _, line := range strings.Split(out, "\n") {
			if strings.TrimSpace(line) != "" {
				info.Dirty++
			}
		}
	}
	// %x1f (unit separator) and %x1e (record separator) cannot appear in a commit message, so
	// they are safe delimiters even though the body spans several lines.
	out, err := git(ctx, dir, "log", "-n", strconv.Itoa(limit), "--pretty=format:%H%x1f%aI%x1f%s%x1f%b%x1e")
	if err != nil {
		return info // a repository without commits yet
	}
	for _, record := range strings.Split(out, "\x1e") {
		parts := strings.SplitN(strings.TrimLeft(record, "\n"), "\x1f", 4)
		if len(parts) != 4 {
			continue
		}
		at, err := time.Parse(time.RFC3339, parts[1])
		if err != nil {
			continue
		}
		c := Commit{Hash: parts[0], Subject: parts[2], At: at}
		c.Refs, c.Closes = ParseRefs(parts[2] + "\n" + parts[3])
		info.Commits = append(info.Commits, c)
	}
	return info
}

func git(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...)
	cmd.Env = append(os.Environ(), "GIT_OPTIONAL_LOCKS=0", "LC_ALL=C")
	out, err := cmd.Output()
	return string(out), err
}
