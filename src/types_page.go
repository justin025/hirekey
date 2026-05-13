package main

// PageData is the base template data structure passed to HTML template rendering.
type PageData struct {
	Title    string
	Category string
}

// AuthPageData extends PageData with authentication-related fields used
// by login and 2FA pages.
type AuthPageData struct {
	PageData
	Error   string
	Message string
	LoginId string
}

// captchaData is the template data structure used for the CAPTCHA page.
type captchaData struct {
	PageData
	CaptchaImage string
}
