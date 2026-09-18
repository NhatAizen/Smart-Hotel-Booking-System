import { ArrowUpRight, MapPin, Star } from "lucide-react";
import { Link } from "react-router-dom";

import EnziuSmartImage from "./EnziuSmartImage";

function money(value) {
  return Number(value ?? 0).toLocaleString("vi-VN");
}

export default function HomeHotelCard({
  hotel,
  image,
  price,
  score,
  reviewCount,
  featured = false,
}) {
  const starRating = Math.max(0, Math.min(5, Number(hotel?.starRating ?? 0)));
  const detailPath = `/hotels/${hotel.id}`;

  return (
    <article className={`enziu-hotel-card ${featured ? "is-featured" : ""}`}>
      <Link to={detailPath} className="enziu-hotel-card-media" aria-label={`Xem ${hotel.name}`}>
        <EnziuSmartImage
          src={image}
          alt={`Không gian tại ${hotel.name}`}
          ratio={featured ? "16 / 10" : "4 / 3"}
        />
        <span className="enziu-hotel-card-index" aria-hidden="true">
          {featured ? "01" : "EN"}
        </span>
        <span className="enziu-hotel-card-open" aria-hidden="true">
          <ArrowUpRight size={19} />
        </span>
      </Link>

      <div className="enziu-hotel-card-body">
        <div className="enziu-hotel-card-rating">
          {starRating > 0 ? (
            <span className="enziu-hotel-stars" aria-label={`${starRating} sao`}>
              <Star size={13} fill="currentColor" /> {starRating}
            </span>
          ) : null}
          {score ? (
            <span>
              <strong>{Number(score).toFixed(1)}</strong>/10
              {reviewCount > 0 ? ` · ${reviewCount} đánh giá` : ""}
            </span>
          ) : null}
        </div>

        <Link to={detailPath} className="enziu-hotel-card-title">
          {hotel.name}
        </Link>

        <div className="enziu-hotel-card-meta">
          <span><MapPin size={14} /> {hotel.city || hotel.address || "Việt Nam"}</span>
          {price ? (
            <span className="enziu-hotel-price">
              từ <strong>{money(price)}đ</strong><small>/ đêm</small>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
