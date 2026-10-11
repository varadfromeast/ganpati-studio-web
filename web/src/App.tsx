import { Component, lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";

const BasePickerPage = lazy(() => import("./pages/BasePickerPage").then((module) => ({ default: module.BasePickerPage })));
const DesignPage = lazy(() => import("./pages/DesignPage").then((module) => ({ default: module.DesignPage })));
const LibraryPage = lazy(() => import("./pages/LibraryPage").then((module) => ({ default: module.LibraryPage })));
const PendingVideoPage = lazy(() => import("./pages/PendingVideoPage").then((module) => ({ default: module.PendingVideoPage })));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage").then((module) => ({ default: module.PrivacyPage })));
const StudioPage = lazy(() => import("./pages/StudioPage").then((module) => ({ default: module.StudioPage })));
const VideoCreatorPage = lazy(() => import("./pages/VideoCreatorPage").then((module) => ({ default: module.VideoCreatorPage })));

export function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<div className="centered-state centered-state--on-blue" role="status">Opening Ganpati Studio…</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="create/:intent" element={<BasePickerPage />} />
            <Route path="studio/:packSlug" element={<StudioPage />} />
            <Route path="design/:designId" element={<DesignPage />} />
            <Route path="video/new" element={<VideoCreatorPage />} />
            <Route path="videos/pending/:attemptId" element={<PendingVideoPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="create" element={<Navigate to="/create/design" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="centered-state centered-state--on-blue" role="alert">
          <h1>Ganpati Studio needs a fresh start.</h1>
          <p>Your saved creations remain on this device. Reload to reopen the latest app.</p>
          <button className="button button--marigold" type="button" onClick={() => window.location.reload()}>
            Reload studio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
