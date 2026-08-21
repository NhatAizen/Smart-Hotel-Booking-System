import { Clock3, RotateCcw } from "lucide-react";

const HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);

const MINUTES = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0"),
);

const PRESETS = {
  checkIn: ["13:00", "14:00", "14:30", "15:00"],
  checkOut: ["10:00", "11:00", "12:00", "12:30"],
};

function parseTime(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return { hour: "", minute: "" };
  }

  const [hour, minute] = value.split(":");
  return { hour, minute };
}

function describeTime(value) {
  if (!value) return "Chưa thiết lập";

  const { hour, minute } = parseTime(value);
  const numericHour = Number(hour);

  if (numericHour === 0) return `${value} = 12:${minute} đêm`;
  if (numericHour < 12) return `${value} = ${numericHour}:${minute} sáng`;
  if (numericHour === 12) return `${value} = 12:${minute} trưa`;
  if (numericHour < 18) return `${value} = ${numericHour - 12}:${minute} chiều`;
  return `${value} = ${numericHour - 12}:${minute} tối`;
}

export default function HotelTimePickerField({
  label,
  value,
  kind = "checkIn",
  presets = PRESETS[kind] ?? [],
  helpText,
  required = false,
  onChange,
}) {
  const { hour, minute } = parseTime(value);

  function updatePart(part, nextValue) {
    if (!nextValue) {
      if (!required) onChange?.(null);
      return;
    }

    const nextHour = part === "hour" ? nextValue : hour || "00";
    const nextMinute = part === "minute" ? nextValue : minute || "00";
    onChange?.(`${nextHour}:${nextMinute}`);
  }

  return (
    <div className="catalog-field catalog-time-field">
      <div className="catalog-time-field__heading">
        <span>{label}</span>
        <small>Định dạng 24 giờ</small>
      </div>

      <div className="catalog-time-picker">
        <label className="catalog-time-part">
          <span>Giờ</span>
          <select
            value={hour}
            onChange={(event) => updatePart("hour", event.target.value)}
            aria-label={`${label} - giờ`}
            required={required}
          >
            <option value="">--</option>
            {HOURS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <span className="catalog-time-picker__colon" aria-hidden="true">:</span>

        <label className="catalog-time-part">
          <span>Phút</span>
          <select
            value={minute}
            onChange={(event) => updatePart("minute", event.target.value)}
            aria-label={`${label} - phút`}
            required={required}
          >
            <option value="">--</option>
            {MINUTES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        {!required && value ? (
          <button
            type="button"
            className="catalog-time-clear"
            onClick={() => onChange?.(null)}
            title={`Xóa ${label.toLowerCase()}`}
          >
            <RotateCcw size={15} aria-hidden="true" />
            Để trống
          </button>
        ) : null}
      </div>

      <div
        className={`catalog-time-preview${value ? " is-set" : ""}`}
        aria-live="polite"
      >
        <Clock3 size={16} aria-hidden="true" />
        <strong>{describeTime(value)}</strong>
      </div>

      {presets.length ? (
        <div className="catalog-time-presets">
          <span>Chọn nhanh:</span>
          <div>
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={value === preset ? "active" : ""}
                onClick={() => onChange?.(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {helpText ? <small className="catalog-time-help">{helpText}</small> : null}
    </div>
  );
}
