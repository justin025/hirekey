package main

// Package main provides authentication middleware, session management,
// and cookie handling for the HireKey application. It implements a
// cookie-based session system with MongoDB-backed session storage and
// two-factor authentication support.
//
// Key features:
//   - Session validation via MongoDB active_sessions collection
//   - Dual-cookie approach (uid for session, auth for user payload)
//   - Automatic session expiry and refresh on each request
//   - IP address extraction from various HTTP headers
//   - Graceful session clearing on expiry or invalidation

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// activeSessionDurationSeconds defines the TTL for active sessions in seconds (7 days).
const activeSessionDurationSeconds int64 = 7 * 24 * 60 * 60

// authCookieName is the name of the cookie storing the Base64URL-encoded
// AuthCookiePayload containing user session data.
const authCookieName string = "auth"

// checkLogin verifies the current HTTP request has a valid active session.
// Returns true if the user is authenticated or if authentication is disabled.
// If not authenticated, redirects to /login with a 302 status.
func checkLogin(w http.ResponseWriter, r *http.Request) bool {
	if EnableLogin == false || EnableAuthCheck == false {
		return true
	}
	_, ok := getCurrentActiveSession(w, r)
	if !ok {
		http.Redirect(w, r, "/login", http.StatusFound)
		return false
	}
	return true
}

// requireLoginAPI wraps an HTTP handler function, ensuring the request
// has a valid session before invoking the next handler. Returns 401 for
// unauthenticated API requests.
func requireLoginAPI(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if EnableLogin == false || EnableAuthCheck == false {
			next(w, r)
			return
		}

		_, ok := getCurrentActiveSession(w, r)
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"Unauthorized"}`))
			return
		}

		next(w, r)
	}
}

// getCurrentActiveSession validates the session cookie from the HTTP request,
// looks up the session in MongoDB, and refreshes its expiry time if valid.
// Returns the ActiveSessionEntry and true if the session is valid, or an empty
// entry and false if the session is missing, expired, or invalid.
func getCurrentActiveSession(w http.ResponseWriter, r *http.Request) (ActiveSessionEntry, bool) {
	emptySession := ActiveSessionEntry{}

	cookie, err := r.Cookie("uid")
	if err != nil || cookie == nil || cookie.Value == "" {
		return emptySession, false
	}

	uid := sanitizeString(cookie.Value, false)
	if uid == "" {
		return emptySession, false
	}

	now := time.Now().Unix()
	nextExpiry := now + activeSessionDurationSeconds

	collection := client.Database(DBName).Collection("active_sessions")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	type activeSessionLookup struct {
		Uid        string `bson:"uid"`
		Username   string `bson:"username"`
		ExpiryTime int64  `bson:"expiry_time"`
	}

	var lookup activeSessionLookup
	err = collection.FindOne(
		ctx,
		bson.M{"uid": uid},
		options.FindOne().SetProjection(bson.M{
			"uid":         1,
			"username":    1,
			"expiry_time": 1,
		}),
	).Decode(&lookup)
	if err == mongo.ErrNoDocuments {
		clearUserSessionCookie(w, r)
		return emptySession, false
	}
	if err != nil {
		if err != mongo.ErrNoDocuments {
			log.Printf("session lookup error: %v", err)
		}
		clearUserSessionCookie(w, r)
		return emptySession, false
	}

	lookupUid := sanitizeString(lookup.Uid, false)
	if lookupUid == "" {
		lookupUid = uid
	}
	lookupUsername := sanitizeString(lookup.Username, false)

	if lookup.ExpiryTime <= now {
		clearUserSessionCookie(w, r)
		_, _ = collection.DeleteMany(ctx, bson.M{
			"uid":         lookupUid,
			"expiry_time": bson.M{"$lte": now},
		})
		return emptySession, false
	}

	updateFilter := bson.M{
		"uid":         lookupUid,
		"expiry_time": bson.M{"$gt": now},
	}
	updateResult, err := collection.UpdateOne(
		ctx,
		updateFilter,
		bson.M{
			"$set": bson.M{
				"expiry_time": nextExpiry,
			},
		},
	)
	if err != nil {
		log.Printf("session refresh error: %v", err)
		clearUserSessionCookie(w, r)
		return emptySession, false
	}
	if updateResult.MatchedCount == 0 {
		clearUserSessionCookie(w, r)
		return emptySession, false
	}

	refreshUserSessionCookie(w, r, lookupUid, nextExpiry)
	return ActiveSessionEntry{
		Uid:        lookupUid,
		Username:   lookupUsername,
		ExpiryTime: nextExpiry,
	}, true
}

// upsertActiveSession creates or updates an active session record in MongoDB
// for the given profile ID, username, and login IP address.
func upsertActiveSession(ctx context.Context, profileID string, username string, loginIP string) error {
	now := time.Now().Unix()
	update := bson.M{
		"$set": bson.M{
			"username":    username,
			"login_ip":    loginIP,
			"expiry_time": now + activeSessionDurationSeconds,
		},
		"$setOnInsert": bson.M{
			"uid":        profileID,
			"login_time": now,
		},
	}
	_, err := client.Database(DBName).Collection("active_sessions").UpdateOne(
		ctx,
		bson.M{"uid": profileID},
		update,
		options.Update().SetUpsert(true),
	)
	return err
}

// getRequestIP extracts the client IP address from the HTTP request, checking
// X-Forwarded-For, X-Real-IP, and RemoteAddr headers in order of precedence.
func getRequestIP(r *http.Request) string {
	forwardedFor := sanitizeString(r.Header.Get("X-Forwarded-For"), true)
	if forwardedFor != "" {
		ipParts := strings.Split(forwardedFor, ",")
		firstIP := sanitizeString(strings.TrimSpace(ipParts[0]), true)
		if firstIP != "" {
			return firstIP
		}
	}

	realIP := sanitizeString(r.Header.Get("X-Real-IP"), true)
	if realIP != "" {
		return realIP
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return sanitizeString(host, true)
	}
	return sanitizeString(r.RemoteAddr, true)
}

// refreshUserSessionCookie sets or refreshes the uid session cookie with the
// provided UID and expiry time. The cookie is HttpOnly and uses SameSite lax mode.
func refreshUserSessionCookie(w http.ResponseWriter, r *http.Request, uid string, expiryUnix int64) {
	secureCookie := shouldUseSecureCookie(r)
	cookie := &http.Cookie{
		Name:     "uid",
		Value:    uid,
		Path:     "/",
		Expires:  time.Unix(expiryUnix, 0),
		Secure:   secureCookie,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
}

// refreshUserAuthCookie encodes the AuthCookiePayload as JSON, Base64URL-encodes it,
// and sets it as the auth cookie with the provided expiry time.
func refreshUserAuthCookie(w http.ResponseWriter, r *http.Request, payload AuthCookiePayload, expiryUnix int64) {
	secureCookie := shouldUseSecureCookie(r)
	normalizedPayload := AuthCookiePayload{
		Uid:               sanitizeString(payload.Uid, false),
		Username:          sanitizeString(payload.Username, false),
		FirstName:         sanitizeString(payload.FirstName, true),
		LastName:          sanitizeString(payload.LastName, true),
		Email:             sanitizeString(payload.Email, true),
		Phone:             sanitizeString(payload.Phone, false),
		ProfilePictureURL: sanitizeString(payload.ProfilePictureURL, true),
		ExpiryTime:        expiryUnix,
	}

	rawPayload, err := json.Marshal(normalizedPayload)
	if err != nil {
		return
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(rawPayload)
	if encodedPayload == "" {
		return
	}

	cookie := &http.Cookie{
		Name:     authCookieName,
		Value:    encodedPayload,
		Path:     "/",
		Expires:  time.Unix(expiryUnix, 0),
		Secure:   secureCookie,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
}

// clearUserSessionCookie removes the uid session cookie and delegates to
// clearUserAuthCookie to also remove the auth cookie.
func clearUserSessionCookie(w http.ResponseWriter, r *http.Request) {
	secureCookie := shouldUseSecureCookie(r)
	cookie := &http.Cookie{
		Name:     "uid",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		Secure:   secureCookie,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
	clearUserAuthCookie(w, r)
}

// clearUserAuthCookie removes the auth cookie from the response.
func clearUserAuthCookie(w http.ResponseWriter, r *http.Request) {
	secureCookie := shouldUseSecureCookie(r)
	cookie := &http.Cookie{
		Name:     authCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		Secure:   secureCookie,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
}

// shouldUseSecureCookie determines whether the Secure flag should be set on cookies.
// Currently always returns true for consistent cookie security.
func shouldUseSecureCookie(r *http.Request) bool {
	_ = r
	return true
}

/*
func captchaHandler(w http.ResponseWriter, r *http.Request) {
    rand.Seed(time.Now().UnixNano())

    // Generate Captcha Variables
    captchaText := ""
    runeStr := ""
    for i := 0; i < 7; i++ {
        path := rand.Intn(2)
        if path == 1 {
            num := rand.Intn(10)
            runeStr = strconv.Itoa(num)
        } else {
            letters := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
            runeStr = string(letters[rand.Intn(len(letters))])
        }
        captchaText += runeStr
    }





    // If UID is preexisting update database, else create new entry
    cookie, err := r.Cookie("uid")
    uid := ""
    if err != nil || cookie == nil || cookie.Value == "" {
        // No matching UID found
        uid = strconv.Itoa(rand.Intn(100000000000))
        // TODO: ensure generated uid does not already exist and if not loop
        cookie = &http.Cookie{
            Name:"uid",
            Value: uid,
            Path:"/",
            Expires: time.Now().Add(24 * time.Hour),
            Secure: true,
            HttpOnly: true,
        }
        http.SetCookie(w, cookie)
    } else {
        uid = sanitizeString(cookie.Value, false)
    }


     filter := bson.M{"uid": uid}
     // Set values and inc attempt by 1
    update := bson.M{"$set": bson.M{
                        "uid": uid,
                        "epoch_expiry": time.Now().Unix() + 3600,
                        "ip_address": r.RemoteAddr,
                        "captcha_code": captchaText,
                        "is_valid": false,
                    },
                    "$inc":bson.M{
                        "attempt": 1,
                    },
                }
    collection := client.Database(DBName).Collection("captchas")
    _, err = collection.UpdateOne(
                        context.TODO(),
                        filter,
                        update,
                        options.Update().SetUpsert(true),
                    )
    if err != nil {
        http.Error(w, "err", http.StatusNotFound)
        return
    }
    var result captchaEntry
    err = collection.FindOne(context.Background(), filter).Decode(&result)
    if err != nil {
        http.Error(w, "err", http.StatusNotFound)
        return
    }

    if result.Attempt >= 4 {
        // IP Blacklist
        http.Error(w, "IP Blacklist", http.StatusNotFound)
        return
    }

    // Generate Captcha Image Variables
    width := 260
    height := 80
    strWidth := strconv.Itoa(width)
    strHeight := strconv.Itoa(height)
    shearX := strconv.Itoa(rand.Intn(10) - 5)
    shearY := strconv.Itoa(rand.Intn(10) - 5)
    waveAmp := strconv.Itoa(rand.Intn(5) + 3)
    waveLen := strconv.Itoa(rand.Intn(50) + 80)
    c1X1 := strconv.Itoa(rand.Intn(width))
    c1Y1 := strconv.Itoa(rand.Intn(height))
    c1X2 := strconv.Itoa(rand.Intn(width))
    c1Y2 := strconv.Itoa(rand.Intn(height))
    l1X1 := strconv.Itoa(rand.Intn(width))
    l1Y1 := strconv.Itoa(rand.Intn(height))
    l1X2 := strconv.Itoa(rand.Intn(width))
    l1Y2 := strconv.Itoa(rand.Intn(height))
    l2X1 := strconv.Itoa(rand.Intn(width))
    l2Y1 := strconv.Itoa(rand.Intn(height))
    l2X2 := strconv.Itoa(rand.Intn(width))
    l2Y2 := strconv.Itoa(rand.Intn(height))
    l3X1 := strconv.Itoa(rand.Intn(width))
    l3Y1 := strconv.Itoa(rand.Intn(height))
    l3X2 := strconv.Itoa(rand.Intn(width))
    l3Y2 := strconv.Itoa(rand.Intn(height))
    l4X1 := strconv.Itoa(rand.Intn(width))
    l4Y1 := strconv.Itoa(rand.Intn(height))
    l4X2 := strconv.Itoa(rand.Intn(width))
    l4Y2 := strconv.Itoa(rand.Intn(height))
    l5X1 := strconv.Itoa(rand.Intn(width))
    l5Y1 := strconv.Itoa(rand.Intn(height))
    l5X2 := strconv.Itoa(rand.Intn(width))
    l5Y2 := strconv.Itoa(rand.Intn(height))
    l6X1 := strconv.Itoa(rand.Intn(width))
    l6Y1 := strconv.Itoa(rand.Intn(height))
    l6X2 := strconv.Itoa(rand.Intn(width))
    l6Y2 := strconv.Itoa(rand.Intn(height))

    // Generate captcha png and convert to base64
    cmd := exec.Command(
        "convert",
        "-size", strWidth + "x" + strHeight, "xc:white",
        "-font", "DejaVu-Sans", "-pointsize", "45", "-gravity", "center", "-annotate", "+0+0", captchaText,
        "-shear", shearX + "x" + shearY, "-wave", waveAmp + "x" + waveLen,
        "-strokewidth", "5", "-stroke", "black", "-fill", "transparent", "-draw", "circle " + c1X1 + "," + c1Y1 + " " + c1X2 + "," + c1Y2,
        "-strokewidth", "5", "-stroke", "black", "-draw", "line " + l1X1 + "," + l1Y1 + " " + l1X2 + "," + l1Y2,
        "-strokewidth", "5", "-stroke", "black", "-draw", "line " + l2X1 + "," + l2Y1 + " " + l2X2 + "," + l2Y2,
        "-strokewidth", "4", "-stroke", "black", "-draw", "line " + l3X1 + "," + l3Y1 + " " + l3X2 + "," + l3Y2,
        "-strokewidth", "3", "-stroke", "black", "-draw", "line " + l4X1 + "," + l4Y1 + " " + l4X2 + "," + l4Y2,
        "-strokewidth", "2", "-stroke", "black", "-draw", "line " + l5X1 + "," + l5Y1 + " " + l5X2 + "," + l5Y2,
        "-strokewidth", "2", "-stroke", "black", "-draw", "line " + l6X1 + "," + l6Y1 + " " + l6X2 + "," + l6Y2,
        "-attenuate", "0.5", "+noise", "Impulse", "-strip",
        "-monochrome",
        "png:-",
    )
    magickOutput, err := cmd.Output()
    if err != nil {
        log.Fatalf("Failed to run command: %v", err)
    }
    captchaEncoded := base64.StdEncoding.EncodeToString(magickOutput)



    // Serve Captcha
    tmpldata := captchaData{
        PageData: PageData{
            Title: "CAPTCHA",
            Category: "captcha",
        },
        CaptchaImage: captchaEncoded,
    }

    err = captchaTemplate.ExecuteTemplate(w, "base", tmpldata)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
    }
}
*/

/*
func submitCaptchaHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != "POST" {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    cookie, err := r.Cookie("uid")
    if err != nil || cookie == nil || cookie.Value == "" {
        http.Error(w, "IP Blacklist", http.StatusBadRequest)
        return
    }
    uid := sanitizeString(cookie.Value, false)

    filter := bson.M{"uid": uid}
    var result captchaEntry

    collection := client.Database(DBName).Collection("captchas")
    err = collection.FindOne(context.TODO(), filter).Decode(&result)
    if err != nil {
        http.Error(w, "Invalid Item ID", http.StatusNotFound)
        return
    }

    // Parse form data
    if err := r.ParseForm(); err != nil {
        http.Error(w, "Error parsing form", http.StatusBadRequest)
        return
    }

    if sanitizeString(r.FormValue("captcha_code"), false) != result.CaptchaCode {
        http.Redirect(w, r, "/captcha", http.StatusFound)
        return
    } else {
        update := bson.M{"$set": bson.M{
                        "is_valid": true,
                        "attempt": 0,
                    },
                }
        _, err = collection.UpdateOne(context.TODO(), filter, update)
        if err != nil {
            log.Printf("123")
        }
        http.Redirect(w, r, "/", http.StatusFound)
    }
}







*/
