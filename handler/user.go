package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/calvinfeng/sling/util"

	"github.com/dgrijalva/jwt-go"

	"github.com/calvinfeng/sling/model"
	"github.com/jinzhu/gorm"
	"github.com/labstack/echo/v4"
	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

type (
	// Credential is a payload that captures user submitted credentials.
	Credential struct {
		Username string `json:"name"`
		Password string `json:"password"`
	}

	// TokenCredential is a payload that captures user submitted token
	TokenCredential struct {
		JWTToken string `json:"jwt_token"`
	}

	// TokenResponse is a payload that returns JWT token back to client.
	TokenResponse struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Email    string `json:"email"`
		JWTToken string `json:"jwt_token"`
	}
)

// NewUserHandler returns a handler that creates a new user.
func NewUserHandler(db *gorm.DB) echo.HandlerFunc {
	return func(ctx echo.Context) error {

		user := &model.User{}
		if err := ctx.Bind(user); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}

		if err := user.Validate(); err != nil {
			return echo.NewHTTPError(http.StatusUnprocessableEntity, err)
		}

		hashBytes, err := bcrypt.GenerateFromPassword([]byte(user.Password), 10)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}

		user.Password = ""
		user.PasswordDigest = hashBytes

		// Generate JWT Token
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"name":  user.Name,
			"email": user.Email,
		})

		tokenString, err := token.SignedString(hmacSecret)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}

		user.JWTToken = tokenString

		dbc := db.Create(user).Scan(&user)
		if dbc.Error != nil {
			// Handle duplicate index errors
			if err.(*pq.Error).Code == "23505" {
				errStr := err.Error()
				if strings.Contains(errStr, "email") {
					return echo.NewHTTPError(http.StatusBadRequest, "Email already in use.")
				}

				if strings.Contains(errStr, "name") {
					return echo.NewHTTPError(http.StatusBadRequest, "Username already in use.")
				}

				return echo.NewHTTPError(http.StatusConflict, err.Error())
			}
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}

		payload := ActionPayload{UserID: user.ID}
		broker.handleCreateUser(payload)

		return ctx.JSON(http.StatusCreated, user)
	}
}

// LoginHandler returns a handler that logs a user in.
func LoginHandler(db *gorm.DB) echo.HandlerFunc {
	return func(ctx echo.Context) error {
		c := &Credential{}
		if err := ctx.Bind(c); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}

		util.LogInfo(c.Username)
		user, err := findUserByCredentials(db, c)
		if err != nil {
			return echo.NewHTTPError(http.StatusUnauthorized, "wrong username or password")
		}

		return ctx.JSON(http.StatusOK, TokenResponse{
			ID:       fmt.Sprint(user.ID),
			Name:     user.Name,
			Email:    user.Email,
			JWTToken: user.JWTToken,
		})
	}

}

// GetCurrentUserHandler returns a handler that gets the current user.
func GetCurrentUserHandler(db *gorm.DB) echo.HandlerFunc {
	return func(ctx echo.Context) error {
		return ctx.JSON(http.StatusOK, ctx.Get("current_user"))
	}
}

// GetUsersHandler returns a handler that gets all current users.
func GetUsersHandler(db *gorm.DB) echo.HandlerFunc {
	return func(ctx echo.Context) error {
		var users []*model.User

		if err := db.Find(&users).Error; err != nil {
			return echo.NewHTTPError(http.StatusNotFound, err)
		}

		// Clear token for security
		for _, u := range users {
			u.JWTToken = ""
		}

		return ctx.JSON(http.StatusOK, users)
	}
}
