import { Home, Images, ShieldCheck, WandSparkles } from "lucide-react";
import { useLayoutEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const navigation = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/create/design", label: "Create", icon: WandSparkles, end: false },
  { to: "/library", label: "Creations", icon: Images, end: false },
  { to: "/privacy", label: "Privacy", icon: ShieldCheck, end: false },
];

export function AppShell() {
  const location = useLocation();
  const editorLike = location.pathname.startsWith("/studio/");

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    const resetScroll = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);
    document.getElementById("main-content")?.focus({ preventScroll: true });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  useLayoutEffect(() => {
    let frame = 0;
    const revealKeyboardFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.tabIndex < 0 || !target.matches(":focus-visible")) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        for (const dock of document.querySelectorAll<HTMLElement>(".finish-dock, .bottom-nav")) {
          if (dock.contains(target) || getComputedStyle(dock).position !== "fixed") continue;
          const obstruction = dock.getBoundingClientRect();
          if (rect.bottom > obstruction.top && rect.top < obstruction.bottom
            && rect.right > obstruction.left && rect.left < obstruction.right) {
            window.scrollBy({ top: rect.bottom - obstruction.top + 24, behavior: "instant" });
          }
        }
      });
    };
    document.addEventListener("focusin", revealKeyboardFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", revealKeyboardFocus);
    };
  }, []);

  return (
    <div className={editorLike ? "app-shell app-shell--studio" : "app-shell"}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      {!editorLike && (
        <nav className="bottom-nav" aria-label="Primary navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => isActive ? "bottom-nav__item is-active" : "bottom-nav__item"}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
