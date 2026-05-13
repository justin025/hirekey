package main

// Package main is the web server entry point for HireKey. It handles HTTP routing,
// template parsing, MongoDB connection initialization, mock data seeding, and serves
// both HTML pages and JSON API endpoints.
//
// The application uses a cookie-based authentication system with MongoDB-backed
// session storage. All API endpoints are versioned under /api/v1/ and protected
// by the requireLoginAPI middleware.
//
// Key endpoints:
//
//	HTTP Pages:
//	  GET  /            - Feed page
//	  GET  /login        - Login/Signup page
//	  POST /submit/login  - Login submission
//	  POST /submit/signup - Signup submission
//	  GET  /2fa          - Two-factor authentication page
//	  POST /submit/2fa   - 2FA verification
//
//	API v1 Endpoints:
//	  GET    /api/v1/profile/{username}    - Get profile
//	  GET    /api/v1/feed                  - Get feed posts
//	  GET    /api/v1/search/profile        - Search profiles
//	  POST   /api/v1/like                  - Toggle like
//	  POST   /api/v1/follow                - Toggle follow
//	  GET    /api/v1/chat/message          - Chat messages
//	  GET    /api/v1/settings/account      - Account settings
//	  ... (see api.go for full API surface)

import (
	"context"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// templateErr stores the last error encountered during template parsing.
var templateErr error

// baseTemplate is the root HTML template containing the common layout,
// CSS/JS includes, and template extensions for content blocks.
var baseTemplate *template.Template

// loginTemplate extends baseTemplate with the login/signup form template.
var loginTemplate *template.Template

// twoFATemplate extends baseTemplate with the two-factor authentication form template.
var twoFATemplate *template.Template

// client is the shared MongoDB client connection used across all handlers.
var client *mongo.Client

// Main is the entry point for the HireKey application.
// It initializes templates, connects to MongoDB, seeds mock data if enabled,
// and starts the HTTP server with all route handlers.
func Main() {
	// Parse HTTP Templates
	baseTemplate, templateErr = template.ParseFiles("templates/base.html", "templates/home.html")
	if templateErr != nil {
		log.Fatalf("Error parsing templates: %v", templateErr)
		return
	}
	loginTemplate, templateErr = template.ParseFiles("templates/base.html", "templates/login.html")
	if templateErr != nil {
		log.Fatalf("Error parsing templates: %v", templateErr)
		return
	}
	twoFATemplate, templateErr = template.ParseFiles("templates/base.html", "templates/2fa.html")
	if templateErr != nil {
		log.Fatalf("Error parsing templates: %v", templateErr)
		return
	}

	// Connect to MongoDB
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var err error
	client, err = mongo.Connect(ctx, options.Client().ApplyURI(MongoDBURL))
	if err != nil {
		log.Fatal(err)
	}
	defer client.Disconnect(ctx)

	if EnableMockProfileData || EnableMockPostData {
		mockCtx, mockCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer mockCancel()
		if err := seedMockData(mockCtx, EnableMockProfileData, EnableMockPostData); err != nil {
			log.Fatalf("Error seeding mock data: %v", err)
			return
		}
	}
	if EnableMockRecruitData {
		mockRecruitCtx, mockRecruitCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer mockRecruitCancel()
		if err := seedMockRecruitData(mockRecruitCtx); err != nil {
			log.Fatalf("Error seeding mock recruit data: %v", err)
			return
		}
	}
	if EnableMockEventData {
		mockEventCtx, mockEventCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer mockEventCancel()
		if err := seedMockEventData(mockEventCtx); err != nil {
			log.Fatalf("Error seeding mock event data: %v", err)
			return
		}
	}
	if EnableMockStoryData {
		mockStoryCtx, mockStoryCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer mockStoryCancel()
		if err := seedMockStoryData(mockStoryCtx); err != nil {
			log.Fatalf("Error seeding mock story data: %v", err)
			return
		}
	}
	if EnableMockMarketplaceData {
		mockMarketplaceCtx, mockMarketplaceCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer mockMarketplaceCancel()
		if err := seedMockMarketplaceData(mockMarketplaceCtx); err != nil {
			log.Fatalf("Error seeding mock marketplace data: %v", err)
			return
		}
	}
	startStoryExpiryGarbageCollector()

	// Set up HTTP handlers
	http.HandleFunc("/", baseHandler)
	http.HandleFunc("/api/v1/story", requireLoginAPI(storyHandler))
	http.HandleFunc("/api/v1/story/", requireLoginAPI(storyHandler))
	http.HandleFunc("/api/v1/profile/events", requireLoginAPI(profileEventsHandler))
	http.HandleFunc("/api/v1/profile/", requireLoginAPI(GetProfileHandler))
	http.HandleFunc("/api/v1/post/", requireLoginAPI(GetPostHandler))
	http.HandleFunc("/api/v1/post/view", requireLoginAPI(postViewHandler))
	http.HandleFunc("/api/v1/post/edit", requireLoginAPI(postEditHandler))
	http.HandleFunc("/api/v1/post/delete", requireLoginAPI(postDeleteHandler))
	http.HandleFunc("/api/v1/feed", requireLoginAPI(FeedPostsHandler))
	http.HandleFunc("/api/v1/recruit", requireLoginAPI(GetRecruitHandler))
	http.HandleFunc("/api/v1/marketplace", requireLoginAPI(MarketplaceHandler))
	http.HandleFunc("/api/v1/marketplace/", requireLoginAPI(MarketplaceHandler))
	http.HandleFunc("/api/v1/event", requireLoginAPI(EventHandler))
	http.HandleFunc("/api/v1/event/", requireLoginAPI(EventHandler))
	http.HandleFunc("/api/v1/events", requireLoginAPI(EventHandler))
	http.HandleFunc("/api/v1/events/", requireLoginAPI(EventHandler))
	http.HandleFunc("/api/v1/event/rsvp", requireLoginAPI(eventRsvpHandler))
	http.HandleFunc("/api/v1/event/rsvp/", requireLoginAPI(eventRsvpHandler))
	http.HandleFunc("/api/v1/events/rsvp", requireLoginAPI(eventRsvpHandler))
	http.HandleFunc("/api/v1/events/rsvp/", requireLoginAPI(eventRsvpHandler))
	http.HandleFunc("/api/v1/search/profile", requireLoginAPI(SearchProfilesHandler))
	http.HandleFunc("/api/v1/like", requireLoginAPI(likeHandler))
	http.HandleFunc("/api/v1/like/state", requireLoginAPI(likeStateBatchHandler))
	http.HandleFunc("/api/v1/like/add", requireLoginAPI(likeAddHandler))
	http.HandleFunc("/api/v1/like/remove", requireLoginAPI(likeRemoveHandler))
	http.HandleFunc("/api/v1/share", requireLoginAPI(shareHandler))
	http.HandleFunc("/api/v1/share/state", requireLoginAPI(shareStateBatchHandler))
	http.HandleFunc("/api/v1/share/add", requireLoginAPI(shareAddHandler))
	http.HandleFunc("/api/v1/share/remove", requireLoginAPI(shareRemoveHandler))
	http.HandleFunc("/api/v1/repost", requireLoginAPI(repostHandler))
	http.HandleFunc("/api/v1/repost/state", requireLoginAPI(repostStateBatchHandler))
	http.HandleFunc("/api/v1/repost/add", requireLoginAPI(repostAddHandler))
	http.HandleFunc("/api/v1/repost/remove", requireLoginAPI(repostRemoveHandler))
	http.HandleFunc("/api/v1/save", requireLoginAPI(saveHandler))
	http.HandleFunc("/api/v1/save/state", requireLoginAPI(saveStateBatchHandler))
	http.HandleFunc("/api/v1/save/add", requireLoginAPI(saveAddHandler))
	http.HandleFunc("/api/v1/save/remove", requireLoginAPI(saveRemoveHandler))
	http.HandleFunc("/api/v1/follow", requireLoginAPI(followHandler))
	http.HandleFunc("/api/v1/follow/state", requireLoginAPI(followStateBatchHandler))
	http.HandleFunc("/api/v1/follow/add", requireLoginAPI(followAddHandler))
	http.HandleFunc("/api/v1/follow/remove", requireLoginAPI(followRemoveHandler))
	http.HandleFunc("/api/v1/block", requireLoginAPI(blockHandler))
	http.HandleFunc("/api/v1/block/add", requireLoginAPI(blockAddHandler))
	http.HandleFunc("/api/v1/block/remove", requireLoginAPI(blockRemoveHandler))
	http.HandleFunc("/api/v1/block/list", requireLoginAPI(blockListHandler))
	http.HandleFunc("/api/v1/report", requireLoginAPI(reportHandler))
	http.HandleFunc("/api/v1/comment", requireLoginAPI(commentHandler))
	http.HandleFunc("/api/v1/chat/message", requireLoginAPI(ChatMessageHandler))
	http.HandleFunc("/api/v1/chat/unread", requireLoginAPI(ChatUnreadHandler))
	http.HandleFunc("/api/v1/settings/account", requireLoginAPI(settingsAccountHandler))
	http.HandleFunc("/api/v1/settings/password", requireLoginAPI(settingsPasswordHandler))
	http.HandleFunc("/api/v1/settings/logout", requireLoginAPI(settingsLogoutHandler))
	http.HandleFunc("/api/v1/settings/account/delete", requireLoginAPI(settingsDeleteAccountHandler))
	http.HandleFunc("/login", loginHandler)
	http.HandleFunc("/submit/login", submitLoginHandler)
	http.HandleFunc("/submit/signup", submitSignupHandler)
	http.HandleFunc("/2fa", twoFactorHandler)
	http.HandleFunc("/submit/2fa", submitTwoFactorHandler)
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	log.Println("Server starting on :" + Port)
	log.Fatal(http.ListenAndServe(":"+Port, nil))
}

// baseHandler serves the main feed page. It validates the user session via checkLogin
// and renders the base template with the feed category context.
func baseHandler(w http.ResponseWriter, r *http.Request) {
	//    http.Redirect(w, r, "/catalog/all", http.StatusFound)
	if !checkLogin(w, r) {
		return
	}

	tmpldata := PageData{
		Title:    "Feed - " + PageTitle,
		Category: "feed",
	}
	err := baseTemplate.ExecuteTemplate(w, "base", tmpldata)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

}

// loginHandler renders the login/signup page with any error or message
// from the query string.
func loginHandler(w http.ResponseWriter, r *http.Request) {
	tmpldata := AuthPageData{
		PageData: PageData{
			Title:    "Login - " + PageTitle,
			Category: "login",
		},
		Error:   sanitizeString(r.URL.Query().Get("err"), true),
		Message: sanitizeString(r.URL.Query().Get("msg"), true),
	}
	err := loginTemplate.ExecuteTemplate(w, "base", tmpldata)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// submitLoginHandler processes login form submissions. It validates credentials
// against the logins collection, resolves the associated profile, creates an active
// session in MongoDB, and sets the uid and auth cookies on successful authentication.
func submitLoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse form data
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}
	username := sanitizeString(r.FormValue("username"), false)
	password := sanitizeString(r.FormValue("password"), true)
	if username == "" || password == "" {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Invalid username or password"), http.StatusSeeOther)
		return
	}

	filter := bson.M{
		"username":  username,
		"password":  password,
		"is_locked": false,
		"is_banned": bson.M{"$ne": true},
	}
	var result LoginEntry
	collection := client.Database(DBName).Collection("logins")
	loginCtx, loginCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer loginCancel()
	err := collection.FindOne(loginCtx, filter).Decode(&result)
	if err != nil {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Invalid username or password"), http.StatusSeeOther)
		return
	}

	profilesCollection := client.Database(DBName).Collection("profiles")
	var profileEntry ProfileData
	err = profilesCollection.FindOne(loginCtx, bson.M{"username": result.Username}).Decode(&profileEntry)
	if err != nil {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Unable to resolve profile"), http.StatusSeeOther)
		return
	}

	uid := sanitizeString(profileEntry.Id.Hex(), false)
	if uid == "" {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Unable to create session"), http.StatusSeeOther)
		return
	}
	sessionUsername := sanitizeString(result.Username, false)
	if sessionUsername == "" {
		sessionUsername = username
	}

	loginIP := getRequestIP(r)
	if loginIP == "" {
		loginIP = "unknown"
	}

	sessionCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = upsertActiveSession(sessionCtx, uid, sessionUsername, loginIP)
	if err != nil {
		log.Printf("active session upsert failed: %v", err)
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Unable to create session"), http.StatusSeeOther)
		return
	}

	refreshUserSessionCookie(w, r, uid, time.Now().Unix()+activeSessionDurationSeconds)
	refreshUserAuthCookie(w, r, AuthCookiePayload{
		Uid:               uid,
		Username:          sanitizeString(profileEntry.Username, false),
		FirstName:         sanitizeString(profileEntry.FirstName, true),
		LastName:          sanitizeString(profileEntry.LastName, true),
		Email:             sanitizeString(result.Email, true),
		Phone:             sanitizeString(result.PhoneNumber, false),
		ProfilePictureURL: sanitizeString(profileEntry.ProfilePictureURL, true),
		ExpiryTime:        time.Now().Unix() + activeSessionDurationSeconds,
	}, time.Now().Unix()+activeSessionDurationSeconds)

	http.Redirect(w, r, "/", http.StatusSeeOther)
}

// submitSignupHandler processes signup form submissions. It validates the input,
// checks for duplicate usernames/phones, creates a login entry with is_locked=true,
// and redirects to the 2FA verification page.
func submitSignupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseForm(); err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	firstName := sanitizeString(r.FormValue("first_name"), true)
	lastName := sanitizeString(r.FormValue("last_name"), true)
	email := sanitizeString(r.FormValue("email"), true)
	phoneNumber := sanitizeString(r.FormValue("phone_number"), false)
	username := sanitizeString(r.FormValue("username"), false)
	password := sanitizeString(r.FormValue("password"), true)

	if firstName == "" || lastName == "" || email == "" || phoneNumber == "" || username == "" || password == "" {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("All fields are required"), http.StatusSeeOther)
		return
	}
	if !strings.Contains(email, "@") {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Enter a valid email address"), http.StatusSeeOther)
		return
	}

	collection := client.Database(DBName).Collection("logins")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	duplicateFilter := bson.M{
		"$or": bson.A{
			bson.M{"username": username},
			bson.M{"phone_number": phoneNumber},
		},
	}
	duplicateErr := collection.FindOne(ctx, duplicateFilter).Err()
	if duplicateErr == nil {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Account already exists"), http.StatusSeeOther)
		return
	}
	if duplicateErr != nil && duplicateErr != mongo.ErrNoDocuments {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Unable to create account"), http.StatusSeeOther)
		return
	}

	insertData := bson.M{
		"first_name":   firstName,
		"last_name":    lastName,
		"username":     username,
		"password":     password,
		"phone_number": phoneNumber,
		"email":        email,
		"is_locked":    true,
	}
	result, err := collection.InsertOne(ctx, insertData)
	if err != nil {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Unable to create account"), http.StatusSeeOther)
		return
	}

	loginId, ok := result.InsertedID.(primitive.ObjectID)
	if !ok {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Unable to create account"), http.StatusSeeOther)
		return
	}

	http.Redirect(w, r, "/2fa?login_id="+url.QueryEscape(loginId.Hex()), http.StatusSeeOther)
}

// twoFactorHandler renders the two-factor authentication page with the login ID
// from the query string and any error or message parameters.
func twoFactorHandler(w http.ResponseWriter, r *http.Request) {
	loginId := sanitizeString(r.URL.Query().Get("login_id"), false)
	tmpldata := AuthPageData{
		PageData: PageData{
			Title:    "2FA - " + PageTitle,
			Category: "2fa",
		},
		Error:   sanitizeString(r.URL.Query().Get("err"), true),
		Message: sanitizeString(r.URL.Query().Get("msg"), true),
		LoginId: loginId,
	}
	err := twoFATemplate.ExecuteTemplate(w, "base", tmpldata)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// submitTwoFactorHandler processes 2FA verification. It validates the code against
// the hardcoded mock value "111111", unlocks the login entry, and creates or updates
// the associated profile document. On success, redirects to login with a verification message.
func submitTwoFactorHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseForm(); err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	loginId := sanitizeString(r.FormValue("login_id"), false)
	code := sanitizeString(
		r.FormValue("code_1")+
			r.FormValue("code_2")+
			r.FormValue("code_3")+
			r.FormValue("code_4")+
			r.FormValue("code_5")+
			r.FormValue("code_6"),
		false,
	)
	if code == "" {
		code = sanitizeString(r.FormValue("code"), false)
	}
	if loginId == "" {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Signup session expired"), http.StatusSeeOther)
		return
	}
	if code != "111111" {
		http.Redirect(w, r, "/2fa?login_id="+url.QueryEscape(loginId)+"&err="+url.QueryEscape("Invalid verification code"), http.StatusSeeOther)
		return
	}

	objectId, err := primitive.ObjectIDFromHex(loginId)
	if err != nil {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Signup session expired"), http.StatusSeeOther)
		return
	}

	loginsCollection := client.Database(DBName).Collection("logins")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var loginEntry LoginEntry
	err = loginsCollection.FindOne(ctx, bson.M{
		"_id":       objectId,
		"is_locked": true,
	}).Decode(&loginEntry)
	if err == mongo.ErrNoDocuments {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Could not verify account"), http.StatusSeeOther)
		return
	}
	if err != nil {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Could not verify account"), http.StatusSeeOther)
		return
	}

	username := sanitizeString(loginEntry.Username, false)
	firstName := sanitizeString(loginEntry.FirstName, true)
	lastName := sanitizeString(loginEntry.LastName, true)
	if username == "" || firstName == "" || lastName == "" {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Could not verify account"), http.StatusSeeOther)
		return
	}

	profilesCollection := client.Database(DBName).Collection("profiles")
	_, err = profilesCollection.UpdateOne(
		ctx,
		bson.M{"username": username},
		bson.M{
			"$setOnInsert": bson.M{
				"username":     username,
				"first_name":   firstName,
				"last_name":    lastName,
				"followers":    0,
				"created_time": int(time.Now().Unix()),
			},
		},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Could not verify account"), http.StatusSeeOther)
		return
	}

	update := bson.M{
		"$set": bson.M{
			"is_locked": false,
		},
	}
	result, err := loginsCollection.UpdateOne(ctx, bson.M{
		"_id":       objectId,
		"is_locked": true,
	}, update)
	if err != nil || result.MatchedCount == 0 {
		http.Redirect(w, r, "/login?err="+url.QueryEscape("Could not verify account"), http.StatusSeeOther)
		return
	}

	http.Redirect(w, r, "/login?msg="+url.QueryEscape("Account verified. Please log in."), http.StatusSeeOther)
}
