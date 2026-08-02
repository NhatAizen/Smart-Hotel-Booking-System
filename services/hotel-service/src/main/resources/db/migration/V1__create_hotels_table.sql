CREATE TABLE hotels
(
    id UUID PRIMARY KEY,

    owner_id UUID NOT NULL,

    name VARCHAR(150) NOT NULL,

    description TEXT,

    address VARCHAR(255) NOT NULL,

    city VARCHAR(100) NOT NULL,

    phone VARCHAR(30),

    email VARCHAR(150),

    star_rating INTEGER NOT NULL DEFAULT 0,

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_hotels_star_rating
        CHECK (star_rating BETWEEN 0 AND 5),

    CONSTRAINT ck_hotels_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX idx_hotels_owner_id
    ON hotels (owner_id);

CREATE INDEX idx_hotels_city
    ON hotels (city);

CREATE INDEX idx_hotels_status
    ON hotels (status);