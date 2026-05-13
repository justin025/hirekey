package main

// SettingsAccountData represents the user account data returned by the
// settings account API endpoint.
type SettingsAccountData struct {
	Username          string `json:"username"`
	FirstName         string `json:"first_name"`
	LastName          string `json:"last_name"`
	Email             string `json:"email"`
	PhoneNumber       string `json:"phone_number"`
	ProfilePictureURL string `json:"profile_picture_url"`
}

// SettingsAccountUpdateRequest represents the JSON body for updating
// the current user's account information.
type SettingsAccountUpdateRequest struct {
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	Email       string `json:"email"`
	PhoneNumber string `json:"phone_number"`
}

// SettingsPasswordUpdateRequest represents the JSON body for updating
// the current user's password.
type SettingsPasswordUpdateRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
	ConfirmPassword string `json:"confirm_password"`
}
