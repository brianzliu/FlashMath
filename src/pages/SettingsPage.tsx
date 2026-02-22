import { useState, useEffect } from "react";
import * as commands from "@/lib/commands";
import type { LLMConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { Switch } from "@/components/ui/switch";
import { Cpu, Save, Plug, PencilRuler } from "lucide-react";

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
  const shuffleCards = useAppStore((state) => state.shuffleCards);
  const setShuffleCards = useAppStore((state) => state.setShuffleCards);

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
      .catch(() => { })
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
      await handleSave();
      await commands.ocrImage("");
      setTestResult("Connection successful.");
    } catch (err) {
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

  if (loading)
    return <p className="text-muted-foreground py-8 text-center">Loading...</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your LLM for OCR and difficulty estimation.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">LLM Provider</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                onClick={() => handleProviderChange(p.value)}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                  provider === p.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {provider !== "ollama" && (
            <div>
              <label className="block text-sm font-medium mb-1.5">
                API Key
              </label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">Model</label>
            <Input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., gpt-4o"
            />
          </div>

          {(provider === "ollama" || provider === "custom") && (
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Base URL
              </label>
              <Input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleTest}
              disabled={testing}
            >
              <Plug className="h-4 w-4 mr-1.5" />
              {testing ? "Testing..." : "Test Connection"}
            </Button>
          </div>

          {saveMessage && (
            <Badge
              variant={
                saveMessage.startsWith("Error") ? "destructive" : "success"
              }
            >
              {saveMessage}
            </Badge>
          )}
          {testResult && (
            <Badge
              variant={
                testResult.includes("failed") ? "destructive" : "success"
              }
            >
              {testResult}
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <PencilRuler className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">Study Preferences</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">
                Shuffle Flashcards
              </label>
              <p className="text-xs text-muted-foreground">
                Randomize the order of due cards during study sessions.
              </p>
            </div>
            <Switch
              checked={shuffleCards}
              onCheckedChange={setShuffleCards}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
