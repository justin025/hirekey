package main

// BlockStateResponse is the JSON response indicating whether the current user
// has blocked the specified profile.
type BlockStateResponse struct {
	RelID     string `json:"rel_id"`
	IsBlocked bool   `json:"is_blocked"`
}

// BlockedProfileSummary represents a single entry in the blocked profiles list.
type BlockedProfileSummary struct {
	RelID             string `json:"rel_id"`
	Username          string `json:"username"`
	FirstName         string `json:"first_name"`
	LastName          string `json:"last_name"`
	ProfilePictureURL string `json:"profile_picture_url"`
	Time              int64  `json:"time"`
}

// BlockedProfilesResponse is the JSON response returned by the blocked profiles list API.
type BlockedProfilesResponse struct {
	BlockedProfiles []BlockedProfileSummary `json:"blocked_profiles"`
}

// ReportCreateRequest represents the JSON body for submitting a content or profile report.
type ReportCreateRequest struct {
	RelID      string `json:"rel_id"`
	EntityType string `json:"entity_type"`
	Reason     string `json:"reason"`
}

// ReportResponse is the JSON response returned after submitting a report.
type ReportResponse struct {
	RelID      string `json:"rel_id"`
	EntityType string `json:"entity_type"`
	Message    string `json:"message"`
}
