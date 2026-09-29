-- Imported by `npm run db:import` (see db/import.js). Safe to re-run: existing tables are skipped.
-- The first four tables are Better Auth's (column types match what its own migration would create).

CREATE TABLE IF NOT EXISTS `user` (
	id            VARCHAR(36)  NOT NULL PRIMARY KEY,
	name          TEXT         NOT NULL,
	email         VARCHAR(255) NOT NULL UNIQUE,
	emailVerified BOOLEAN      NOT NULL,
	image         TEXT,
	createdAt     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updatedAt     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS session (
	id        VARCHAR(36)  NOT NULL PRIMARY KEY,
	expiresAt TIMESTAMP(3) NOT NULL,
	token     VARCHAR(255) NOT NULL UNIQUE,
	createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updatedAt TIMESTAMP(3) NOT NULL,
	ipAddress TEXT,
	userAgent TEXT,
	userId    VARCHAR(36)  NOT NULL,
	INDEX (userId),
	FOREIGN KEY (userId) REFERENCES `user` (id) ON DELETE CASCADE
);

-- One row per login method: 'credential' (password), 'google', 'linkedin'
CREATE TABLE IF NOT EXISTS account (
	id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
	accountId             TEXT         NOT NULL,
	providerId            TEXT         NOT NULL,
	userId                VARCHAR(36)  NOT NULL,
	accessToken           TEXT,
	refreshToken          TEXT,
	idToken               TEXT,
	accessTokenExpiresAt  TIMESTAMP(3) NULL,
	refreshTokenExpiresAt TIMESTAMP(3) NULL,
	scope                 TEXT,
	password              TEXT,
	createdAt             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updatedAt             TIMESTAMP(3) NOT NULL,
	INDEX (userId),
	FOREIGN KEY (userId) REFERENCES `user` (id) ON DELETE CASCADE
);

-- Short-lived codes: email OTPs, SSO state
CREATE TABLE IF NOT EXISTS verification (
	id         VARCHAR(36)  NOT NULL PRIMARY KEY,
	identifier VARCHAR(255) NOT NULL,
	value      TEXT         NOT NULL,
	expiresAt  TIMESTAMP(3) NOT NULL,
	createdAt  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updatedAt  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	INDEX (identifier)
);

-- Written by routes/(auth)/checkout/webhook, read by the dashboard
CREATE TABLE IF NOT EXISTS subscription (
	user_id            VARCHAR(36)  NOT NULL PRIMARY KEY,
	plan               VARCHAR(50)  NOT NULL,  -- slug from the plans list in checkout/polar.js or freemius.js
	status             VARCHAR(20)  NOT NULL,  -- active, trialing, past_due, canceled, expired...
	current_period_end DATETIME     NULL,
	external_id        VARCHAR(100) NOT NULL,  -- Polar subscription ID or Freemius license ID
	updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES `user` (id) ON DELETE CASCADE
);

-- ===================== Add tables below ======================== --
