import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import Detail from "./pages/Detail";
import Reader from "./pages/Reader";
import Sources from "./pages/Sources";
import Bookmarks from "./pages/Bookmarks";
import NotFound from "./pages/NotFound";
import { useSourcesStore } from "./store/sources";
import { migrateStorageKeys } from "./lib/storageKeys";

export default function App() {
  const load = useSourcesStore((s) => s.load);
  useEffect(() => { migrateStorageKeys(); }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/source/:sourceId/:titleId" element={<Detail />} />
        <Route path="/read/:sourceId/:titleId/:chapterId" element={<Reader />} />
        <Route path="/range/:sourceId/:titleId/:start/:end" element={<Reader />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
