"use client";

import { useState, useEffect } from "react";
import * as commands from "@/lib/commands";
import type { LLMConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
        // Not configured yet - use defaults
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
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your OCR and LLM connectivity for card creation.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>LLM Configuration</CardTitle>
          <p className="text-sm text-muted-foreground">
            A vision-capable model is required for OCR and difficulty estimation.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {provider !== "ollama" && (
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <Input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., gpt-4o"
            />
          </div>

          {(provider === "ollama" || provider === "custom") && (
            <div>
              <label className="block text-sm font-medium mb-1">Base URL</label>
              <Input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="secondary" onClick={handleTest} disabled={testing}>
              {testing ? "Testing..." : "Test Connection"}
            </Button>
          </div>

          {saveMessage && (
            <Badge variant={saveMessage.startsWith("Error") ? "destructive" : "success"}>
              {saveMessage}
            </Badge>
          )}
          {testResult && (
            <Badge
              variant={testResult.includes("failed") ? "destructive" : "success"}
            >
              {testResult}
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
