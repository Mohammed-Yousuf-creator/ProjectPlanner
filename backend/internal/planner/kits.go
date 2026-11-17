package planner

// A starter kit pre-fills the parts of a plan that are the same for every project of one kind:
// the layers of the stack to decide on, the usual build-or-buy questions, the unknowns worth
// checking first, and the names of the build milestones. Nothing in a kit is an answer — every
// entry is a question the planning steps still make you decide.
type Kit struct {
	Key          string   `json:"key"`
	Label        string   `json:"label"`
	Blurb        string   `json:"blurb"`
	StackLayers  []string `json:"stack_layers"`
	Capabilities []string `json:"capabilities"`
	Questions    []string `json:"questions"`
	// Milestones names the five build stages: skeleton, data, core, stories, ship.
	Milestones [5]string `json:"milestones"`
	Skeleton   []string  `json:"skeleton"` // sub-steps of the first task
	ShipTask   string    `json:"ship_task"`
}

var kits = []Kit{
	{
		Key: "cli", Label: "Command-line tool", Blurb: "Runs in a terminal, reads arguments, prints results.",
		StackLayers:  []string{"Language", "Argument parsing", "Configuration", "Output format", "Packaging / install"},
		Capabilities: []string{"Configuration file", "Data storage", "Distribution (how people install it)", "Updates"},
		Questions: []string{
			"What does one typical invocation look like, from command to output?",
			"Where does its data or state live between runs?",
			"How does someone install it on a clean machine?",
		},
		Milestones: [5]string{"Skeleton: the command runs and prints help", "State and configuration work", "The core command works", "MVP commands done", "Installable release"},
		Skeleton:   []string{"Repository and folder structure", "The binary runs and prints --help", "One argument is parsed and echoed back", "git init and first commit"},
		ShipTask:   "Publish an installable release",
	},
	{
		Key: "web", Label: "Web app", Blurb: "Pages in a browser, a server behind them, data that persists.",
		StackLayers:  []string{"Frontend", "Backend", "Database", "Styling", "Hosting"},
		Capabilities: []string{"Authentication", "Database", "File storage", "Email / notifications", "Hosting / deployment"},
		Questions: []string{
			"Which single screen is the app useless without?",
			"Does anything need to update live, or is reload-to-refresh enough for the MVP?",
			"Where will it be hosted, and what does a deploy look like?",
		},
		Milestones: [5]string{"Skeleton: one page served, end to end", "Data layer works", "The core flow works", "MVP stories done", "Deployed and reachable"},
		Skeleton:   []string{"Repository and folder structure (one folder per module)", "Server answers one request", "One page renders data from the server", "git init and first commit"},
		ShipTask:   "Deploy the first working version",
	},
	{
		Key: "api", Label: "API / backend service", Blurb: "No screens: endpoints that other programs call.",
		StackLayers:  []string{"Language & framework", "Database", "API style (REST, RPC, …)", "Testing", "Hosting"},
		Capabilities: []string{"Authentication / API keys", "Database", "Rate limiting", "Documentation", "Hosting / deployment"},
		Questions: []string{
			"Who calls this, and what is the first request they will make?",
			"What happens to a request that is wrong, late or repeated?",
			"How will I know in production that it is broken?",
		},
		Milestones: [5]string{"Skeleton: one endpoint answers", "Data layer works", "The core endpoint works", "MVP endpoints done", "Deployed with documentation"},
		Skeleton:   []string{"Repository and folder structure", "Health endpoint answers", "One request reaches the database and back", "git init and first commit"},
		ShipTask:   "Deploy it and document how to call it",
	},
	{
		Key: "library", Label: "Library / package", Blurb: "Code other developers import.",
		StackLayers:  []string{"Language", "Public API shape", "Testing", "Documentation", "Package registry"},
		Capabilities: []string{"Continuous integration", "Documentation site", "Publishing to a registry", "Versioning policy"},
		Questions: []string{
			"What are the three lines of code a user writes first?",
			"Which existing library does this, and why is mine worth it?",
			"What will I refuse to support?",
		},
		Milestones: [5]string{"Skeleton: it imports and one test runs", "Core data structures work", "The main function works", "MVP surface done", "Published with a usage example"},
		Skeleton:   []string{"Repository and package layout", "One exported function", "One passing test", "git init and first commit"},
		ShipTask:   "Publish the first version with a README example",
	},
	{
		Key: "game", Label: "Game", Blurb: "A loop that draws, takes input and decides who wins.",
		StackLayers:  []string{"Engine / framework", "Language", "Art & audio source", "Input", "Build target"},
		Capabilities: []string{"Save games", "Art assets", "Sound", "Distribution (store, web, download)"},
		Questions: []string{
			"What does the player do in the first 30 seconds?",
			"What is the one mechanic the game is not fun without?",
			"Can I make it playable with rectangles before any art exists?",
		},
		Milestones: [5]string{"Skeleton: a window opens and something moves", "Game state works", "The core mechanic is playable", "MVP mechanics done", "A build someone else can play"},
		Skeleton:   []string{"Repository and folder structure", "Window opens, game loop runs", "One object moves on input", "git init and first commit"},
		ShipTask:   "Make a build someone else can play",
	},
}

// Kits lists the starter kits a new project can pick from.
func Kits() []Kit { return kits }

func kitByKey(key string) (Kit, bool) {
	for _, k := range kits {
		if k.Key == key {
			return k, true
		}
	}
	return Kit{}, false
}
