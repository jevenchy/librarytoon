import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout.js";
import Home from "./pages/Home.js";
import Detail from "./pages/Detail.js";
import Reader from "./pages/Reader.js";
import Sources from "./pages/Sources.js";
import Bookmarks from "./pages/Bookmarks.js";
import NotFound from "./pages/NotFound.js";
import ErrorBoundary from "./components/ui/ErrorBoundary.js";
import { useSourcesStore } from "./store/sources.js";
import { migrateStorageKeys } from "./lib/storageKeys.js";

export default function App() {
  const load = useSourcesStore((state) => state.load);
  useEffect(() => { migrateStorageKeys(); }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
          <Route path="/bookmarks" element={<ErrorBoundary><Bookmarks /></ErrorBoundary>} />
          <Route path="/sources" element={<ErrorBoundary><Sources /></ErrorBoundary>} />
          <Route path="/detail/:sourceId/:titleId" element={<ErrorBoundary><Detail /></ErrorBoundary>} />
          <Route path="/read/:sourceId/:titleId/:chapterId" element={<ErrorBoundary><Reader /></ErrorBoundary>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
