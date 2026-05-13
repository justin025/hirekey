package main

// Package main defines runtime configuration variables for the HireKey application.
// All config is in this file as Go variables — no .env parsing, no os.Getenv.
// Edit directly for different environments.
//
// Groups:
//
//	Core: PageTitle, MongoDBURL, DBName, Port
//	Flags: EnableLogin, EnableAuthCheck, EnableHideViewedPosts
//	Mock: EnableMockProfileData, EnableMockPostData, etc.

// PageTitle is the display name shown in page headers and titles.
var PageTitle string = "HireKey"

// MongoDBURL is the connection string for the MongoDB instance.
var MongoDBURL string = "mongodb://localhost:27017"

// DBName is the name of the MongoDB database used by HireKey.
var DBName string = "hirekey"

// Port is the HTTP server listen port.
var Port string = "8080"

// EnableLogin controls whether the login gate is active.
var EnableLogin bool = true

// EnableAuthCheck controls whether the session middleware validates sessions.
var EnableAuthCheck bool = true

// EnableHideViewedPosts hides previously-viewed posts from the feed.
var EnableHideViewedPosts bool = false

// EnableMockProfileData seeds mock profiles on startup.
var EnableMockProfileData bool = true

// EnableMockPostData seeds mock posts on startup.
var EnableMockPostData bool = true

// EnableMockRecruitData seeds mock recruit candidates on startup.
var EnableMockRecruitData bool = true

// EnableMockEventData seeds mock events on startup.
var EnableMockEventData bool = true

// EnableMockStoryData seeds mock stories on startup.
var EnableMockStoryData bool = true

// EnableMockMarketplaceData seeds mock marketplace listings on startup.
var EnableMockMarketplaceData bool = true

// SearchAutocompleteMinChars is the minimum query length before autocomplete returns results.
var SearchAutocompleteMinChars int = 2
