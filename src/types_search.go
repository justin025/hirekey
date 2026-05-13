package main

import "go.mongodb.org/mongo-driver/bson/primitive"

// SearchProfileEntry is a MongoDB projection struct for profile documents
// returned by the search API, containing only the fields needed for search results.
type SearchProfileEntry struct {
	Id                primitive.ObjectID `bson:"_id"`
	Username          string             `bson:"username"`
	FirstName         string             `bson:"first_name"`
	LastName          string             `bson:"last_name"`
	ProfilePictureURL string             `bson:"profile_picture_url"`
	CreatedTime       int                `bson:"created_time"`
}

// SearchProfileResult represents a single search result in the JSON API response.
type SearchProfileResult struct {
	Username          string `json:"username"`
	FirstName         string `json:"first_name"`
	LastName          string `json:"last_name"`
	ProfilePictureURL string `json:"profile_picture_url"`
}

// SearchProfilesResponse is the JSON response returned by the profile search API.
type SearchProfilesResponse struct {
	Query   string                `json:"query"`
	Results []SearchProfileResult `json:"results"`
}
