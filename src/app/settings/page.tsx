"use client";

import { useState, useEffect } from "react";
import * as commands from "@/lib/commands";
import type { LLMConfig } from "@/lib/types";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "ollama", label: "Ollama (Local)" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
] as const;

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "openai/gpt-4o",
  ollama: "llama3.2-vision",
  custom: "",
};

const DEFAULT_URLS: Record<string, string> = {
  openai: "",
  anthropic: "",
  openrouter: "",
  ollama: "http://localhost:11434",
  custom: "",
};

export default function SettingsPage() {
  const [provider, setProvider] = useState<string>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    commands
      .getLLMConfig()
      .then((config) => {
        setProvider(config.provider);
        setApiKey(config.api_key);
        setModel(config.model);
        setBaseUrl(config.base_url);
      })
      .catch(() => {
        // Not configured yet — use defaults
      })
      .finally(() => setLoading(false));
  }, []);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setModel(DEFAULT_MODELS[newProvider] || "");
    setBaseUrl(DEFAULT_URLS[newProvider] || "");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const config: LLMConfig = {
        provider: provider as LLMConfig["provider"],
        api_key: apiKey,
        model,
        base_url: baseUrl,
      };
      await commands.setLLMConfig(config);
      setSaveMessage("Settings saved.");
    } catch (err) {
      setSaveMessage(`Error: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so the backend has the config
      await handleSave();
      const result = await commands.ocrImage(""); // will likely fail but tests the connection
      setTestResult(`Connection successful: ${result}`);
    } catch (err) {
      // A connection test with empty image will fail, but if it gets past auth that's good
      const errStr = String(err);
      if (errStr.includes("Failed to read image")) {
        setTestResult("Connection successful (LLM reachable).");
      } else {
        setTestResult(`Connection failed: ${errStr}`);
      }
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* LLM Provider */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">LLM Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Configure your LLM provider for OCR (image to LaTeX) and difficulty
            estimation. A vision-capable model is required for OCR.
          </p>
        </div>

        <div className="space-y-4">
          {/* Provider */}
          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          {provider !== "ollama" && (
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              />
            </div>
          )}

          {/* Model */}
          <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., gpt-4o"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            />
          </div>

          {/* Base URL */}
          {(provider === "ollama" || provider === "custom") && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-6 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>

        {saveMessage && (
          <p
            className={`text-sm ${
              saveMessage.startsWith("Error")
                ? "text-destructive"
                : "text-success"
            }`}
          >
            {saveMessage}
          </p>
        )}
        {testResult && (
          <p
            className={`text-sm ${
              testResult.includes("failed")
                ? "text-destructive"
                : "text-success"
            }`}
          >
            {testResult}
          </p>
        )}
      </div>
    </div>
  );
}
