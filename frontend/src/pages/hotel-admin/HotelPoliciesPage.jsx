import {
  Baby,
  BedDouble,
  Building2,
  Cigarette,
  Clock3,
  FileBadge2,
  Info,
  MoonStar,
  PartyPopper,
  PawPrint,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Loading from "../../components/common/Loading";
import { getMyHotels } from "../../services/hotelAdminService";
import { getMyHotelPolicy, updateMyHotelPolicy } from "../../services/policyService";
import "./HotelPoliciesPage.css";

const EMPTY_FORM = {
  checkInTime: "",
  checkOutTime: "",
  lateCheckoutAllowed: null,
  lateCheckoutDetails: "",
  childrenPolicy: "",
  cribAvailable: null,
  extraBedAvailable: null,
  petsAllowed: null,
  smokingAllowed: null,
  partiesAllowed: null,
  quietHoursFrom: "",
  quietHoursTo: "",
  identityDocumentRequired: null,
  checkInInstructions: "",
  additionalRules: [],
};

function createForm(policy) {
  return {
    ...EMPTY_FORM,
    ...policy,
    checkInTime: String(policy?.checkInTime ?? "").slice(0, 5),
    checkOutTime: String(policy?.checkOutTime ?? "").slice(0, 5),
    quietHoursFrom: String(policy?.quietHoursFrom ?? "").slice(0, 5),
    quietHoursTo: String(policy?.quietHoursTo ?? "").slice(0, 5),
    lateCheckoutDetails: policy?.lateCheckoutDetails ?? "",
    childrenPolicy: policy?.childrenPolicy ?? "",
    checkInInstructions: policy?.checkInInstructions ?? "",
    additionalRules: Array.isArray(policy?.additionalRules)
      ? policy.additionalRules.map((rule) => ({ title: rule.title ?? "", content: rule.content ?? "" }))
      : [],
  };
}

function errorCopy(error) {
  const response = error.response?.data;
  if (response?.validationErrors) return Object.values(response.validationErrors).join(" · ");
  return response?.message ?? "Không thể lưu quy định khách sạn.";
}

function TriState({ label, value, onChange, icon: Icon }) {
  return (
    <fieldset className="house-rule-choice">
      <legend><Icon size={18} /> {label}</legend>
      <div role="group" aria-label={label}>
        {[
          [null, "Chưa cung cấp"],
          [true, "Có"],
          [false, "Không"],
        ].map(([option, copy]) => (
          <button
            key={copy}
            type="button"
            className={value === option ? "is-active" : ""}
            onClick={() => onChange(option)}
            aria-pressed={value === option}
          >
            {copy}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function HotelPoliciesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [hotels, setHotels] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState(searchParams.get("hotelId") ?? "");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    getMyHotels()
      .then((data) => {
        if (!active) return;
        const nextHotels = Array.isArray(data) ? data : [];
        setHotels(nextHotels);
        setSelectedHotelId((current) => {
          if (current && nextHotels.some((hotel) => String(hotel.id) === current)) return current;
          return String(nextHotels[0]?.id ?? "");
        });
      })
      .catch((requestError) => active && setError(errorCopy(requestError)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedHotelId) return undefined;
    let active = true;
    setPolicyLoading(true);
    setError("");
    setMessage("");
    setSearchParams({ hotelId: selectedHotelId }, { replace: true });
    getMyHotelPolicy(selectedHotelId)
      .then((data) => active && setForm(createForm(data)))
      .catch((requestError) => active && setError(errorCopy(requestError)))
      .finally(() => active && setPolicyLoading(false));
    return () => { active = false; };
  }, [selectedHotelId, setSearchParams]);

  const selectedHotel = useMemo(
    () => hotels.find((hotel) => String(hotel.id) === selectedHotelId) ?? null,
    [hotels, selectedHotelId],
  );

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateRule(index, field, value) {
    setForm((current) => ({
      ...current,
      additionalRules: current.additionalRules.map((rule, ruleIndex) => (
        ruleIndex === index ? { ...rule, [field]: value } : rule
      )),
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!selectedHotelId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        ...form,
        checkInTime: form.checkInTime || null,
        checkOutTime: form.checkOutTime || null,
        quietHoursFrom: form.quietHoursFrom || null,
        quietHoursTo: form.quietHoursTo || null,
        lateCheckoutDetails: form.lateCheckoutDetails.trim() || null,
        childrenPolicy: form.childrenPolicy.trim() || null,
        checkInInstructions: form.checkInInstructions.trim() || null,
        additionalRules: form.additionalRules.map((rule) => ({
          title: rule.title.trim(),
          content: rule.content.trim(),
        })),
      };
      const updated = await updateMyHotelPolicy(selectedHotelId, payload);
      setForm(createForm(updated));
      setMessage(`Đã lưu chính sách riêng của ${selectedHotel?.name ?? "khách sạn"}.`);
    } catch (requestError) {
      setError(errorCopy(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading message="Đang tải danh sách khách sạn..." />;

  return (
    <main className="hotel-policy-editor-page">
      <header className="hotel-policy-editor-hero">
        <div><span><ShieldCheck size={16} /> HOUSE RULES</span><h1>Chính sách & Quy định</h1><p>Mỗi khách sạn có bộ quy định riêng, lưu trực tiếp vào hệ thống.</p></div>
        <label>
          <Building2 size={18} />
          <span>Khách sạn đang chỉnh</span>
          <select value={selectedHotelId} onChange={(event) => setSelectedHotelId(event.target.value)}>
            {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
          </select>
        </label>
      </header>

      {error ? <div className="house-rule-feedback is-error" role="alert">{error}</div> : null}
      {message ? <div className="house-rule-feedback is-success" role="status">{message}</div> : null}

      {!selectedHotel ? (
        <section className="house-rule-empty"><Building2 size={32} /><h2>Chưa có khách sạn để cấu hình</h2></section>
      ) : policyLoading ? <Loading message="Đang tải quy định khách sạn..." /> : (
        <form className="house-rule-form" onSubmit={handleSave}>
          <section className="house-rule-section">
            <header><span><Clock3 size={21} /></span><div><small>LỊCH LƯU TRÚ</small><h2>Nhận phòng & trả phòng</h2></div></header>
            <div className="house-rule-two-columns">
              <label className="house-rule-field"><span>Giờ nhận phòng</span><input type="time" value={form.checkInTime} onChange={(event) => updateField("checkInTime", event.target.value)} /></label>
              <label className="house-rule-field"><span>Giờ trả phòng</span><input type="time" value={form.checkOutTime} onChange={(event) => updateField("checkOutTime", event.target.value)} /></label>
            </div>
            <TriState label="Cho phép trả phòng trễ" icon={Clock3} value={form.lateCheckoutAllowed} onChange={(value) => updateField("lateCheckoutAllowed", value)} />
            <label className="house-rule-field"><span>Quy định / phụ phí trả phòng trễ (nếu có)</span><textarea value={form.lateCheckoutDetails} onChange={(event) => updateField("lateCheckoutDetails", event.target.value)} maxLength={1000} /></label>
          </section>

          <section className="house-rule-section">
            <header><span><Baby size={21} /></span><div><small>GIA ĐÌNH</small><h2>Trẻ em & giường bổ sung</h2></div></header>
            <label className="house-rule-field"><span>Chính sách trẻ em</span><textarea value={form.childrenPolicy} onChange={(event) => updateField("childrenPolicy", event.target.value)} maxLength={2000} /></label>
            <div className="house-rule-two-columns">
              <TriState label="Có nôi" icon={Baby} value={form.cribAvailable} onChange={(value) => updateField("cribAvailable", value)} />
              <TriState label="Có giường phụ" icon={BedDouble} value={form.extraBedAvailable} onChange={(value) => updateField("extraBedAvailable", value)} />
            </div>
          </section>

          <section className="house-rule-section">
            <header><span><ShieldCheck size={21} /></span><div><small>QUY ĐỊNH CHỖ NGHỈ</small><h2>Không gian & hành vi</h2></div></header>
            <div className="house-rule-choice-grid">
              <TriState label="Cho phép vật nuôi" icon={PawPrint} value={form.petsAllowed} onChange={(value) => updateField("petsAllowed", value)} />
              <TriState label="Cho phép hút thuốc" icon={Cigarette} value={form.smokingAllowed} onChange={(value) => updateField("smokingAllowed", value)} />
              <TriState label="Cho phép tiệc / sự kiện" icon={PartyPopper} value={form.partiesAllowed} onChange={(value) => updateField("partiesAllowed", value)} />
            </div>
            <div className="house-rule-two-columns">
              <label className="house-rule-field"><span>Giờ yên tĩnh từ</span><input type="time" value={form.quietHoursFrom} onChange={(event) => updateField("quietHoursFrom", event.target.value)} /></label>
              <label className="house-rule-field"><span>Đến</span><input type="time" value={form.quietHoursTo} onChange={(event) => updateField("quietHoursTo", event.target.value)} /></label>
            </div>
          </section>

          <section className="house-rule-section">
            <header><span><FileBadge2 size={21} /></span><div><small>TẠI QUẦY</small><h2>Giấy tờ & hướng dẫn nhận phòng</h2></div></header>
            <TriState label="Yêu cầu giấy tờ khi nhận phòng" icon={FileBadge2} value={form.identityDocumentRequired} onChange={(value) => updateField("identityDocumentRequired", value)} />
            <label className="house-rule-field"><span>Hướng dẫn check-in tại khách sạn</span><textarea value={form.checkInInstructions} onChange={(event) => updateField("checkInInstructions", event.target.value)} maxLength={3000} /></label>
          </section>

          <section className="house-rule-section is-wide">
            <header><span><Info size={21} /></span><div><small>MỞ RỘNG</small><h2>Quy định bổ sung</h2></div><button type="button" onClick={() => updateField("additionalRules", [...form.additionalRules, { title: "", content: "" }])} disabled={form.additionalRules.length >= 20}><Plus size={17} /> Thêm quy định</button></header>
            <div className="house-rule-additional-list">
              {form.additionalRules.length ? form.additionalRules.map((rule, index) => (
                <article key={`rule-${index}`}>
                  <label className="house-rule-field"><span>Tiêu đề</span><input value={rule.title} onChange={(event) => updateRule(index, "title", event.target.value)} maxLength={120} required /></label>
                  <label className="house-rule-field"><span>Nội dung</span><textarea value={rule.content} onChange={(event) => updateRule(index, "content", event.target.value)} maxLength={1500} required /></label>
                  <button type="button" aria-label={`Xóa quy định ${index + 1}`} onClick={() => updateField("additionalRules", form.additionalRules.filter((_, ruleIndex) => ruleIndex !== index))}><Trash2 size={17} /></button>
                </article>
              )) : <div className="house-rule-no-additional"><MoonStar size={22} /> Chưa có quy định bổ sung.</div>}
            </div>
          </section>

          <footer className="house-rule-savebar"><div><strong>{selectedHotel.name}</strong><span>Field chưa cấu hình sẽ hiển thị rõ là chưa được khách sạn cung cấp.</span></div><button type="submit" disabled={saving}><Save size={18} /> {saving ? "Đang lưu..." : "Lưu chính sách"}</button></footer>
        </form>
      )}
    </main>
  );
}
