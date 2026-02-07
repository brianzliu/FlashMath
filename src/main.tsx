import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./globals.css";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import FolderPage from "./pages/FolderPage";
import CardPage from "./pages/CardPage";
import StudyPage from "./pages/StudyPage";
import BrowsePage from "./pages/BrowsePage";
import SettingsPage from "./pages/SettingsPage";
import ImportPdfPage from "./pages/ImportPdfPage";
import ImportImagePage from "./pages/ImportImagePage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/folder" element={<FolderPage />} />
          <Route path="/card" element={<CardPage />} />
          <Route path="/study" element={<StudyPage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import/pdf" element={<ImportPdfPage />} />
          <Route path="/import/image" element={<ImportImagePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
