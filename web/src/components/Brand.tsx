import { Link } from "react-router-dom";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={compact ? "brand brand--compact" : "brand"} to="/">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 56 56" role="img">
          <path d="M28 7c2.9 7.2 8.2 11 15.7 11.2-4.8 3.2-6.6 7.6-6.2 13.3-3-2.5-6.1-3.8-9.5-3.8s-6.5 1.3-9.5 3.8c.4-5.7-1.4-10.1-6.2-13.3C19.8 18 25.1 14.2 28 7Z" />
          <path d="M14.5 34.5C18 32.2 22.5 31 28 31s10 1.2 13.5 3.5C38 43 33.5 47.8 28 49c-5.5-1.2-10-6-13.5-14.5Z" />
        </svg>
      </span>
      <span className="brand__words">
        <span>Ganpati</span>
        <span>Studio</span>
      </span>
    </Link>
  );
}
