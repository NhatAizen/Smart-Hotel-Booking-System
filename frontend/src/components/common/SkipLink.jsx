export default function SkipLink({ targetId = "main-content" }) {
  return (
    <a className="skip-link" href={`#${targetId}`}>
      Bỏ qua điều hướng, đến nội dung chính
    </a>
  );
}
