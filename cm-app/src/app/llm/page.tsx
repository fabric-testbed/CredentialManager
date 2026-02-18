"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import SpinnerFullPage from "@/components/spinner-full-page";
import toLocaleTime from "@/utils/to-locale-time";
import {
  createLLMKey,
  getLLMKeys,
  deleteLLMKey,
  getLLMModels,
} from "@/services/credential-manager-service";

interface LLMKey {
  key_alias?: string;
  key_name?: string;
  token?: string;
  llm_key_id?: string;
  spend?: number | null;
  max_budget?: number | null;
  created_at?: string;
  expires?: string;
  expires_at?: string;
}

interface CreatedKeyData {
  api_key?: string;
}

interface ChatboxConfig {
  id: string;
  name: string;
  type: string;
  settings: {
    apiHost: string;
    apiKey: string;
    models: Array<{
      modelId: string;
      capabilities: string[];
      contextWindow: number;
    }>;
  };
}

interface ClaudeCodeConfig {
  env: {
    ANTHROPIC_BASE_URL: string;
    ANTHROPIC_AUTH_TOKEN: string;
    ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
    ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
  };
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  try {
    const err = error as { response?: { data?: { errors?: Array<{ details?: string; message?: string }> } } };
    if (
      err?.response?.data?.errors &&
      Array.isArray(err.response.data.errors) &&
      err.response.data.errors.length > 0
    ) {
      const firstError = err.response.data.errors[0];
      return firstError.details || firstError.message || fallbackMessage;
    }
  } catch {
    // fall through
  }
  return fallbackMessage;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
}

export default function LLMTokensPage() {
  const [keys, setKeys] = useState<LLMKey[]>([]);
  const [createdKey, setCreatedKey] = useState<CreatedKeyData | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createCopySuccess, setCreateCopySuccess] = useState(false);
  const [chatboxConfig, setChatboxConfig] = useState<ChatboxConfig | null>(
    null
  );
  const [chatboxCopySuccess, setChatboxCopySuccess] = useState(false);
  const [claudeCodeConfig, setClaudeCodeConfig] =
    useState<ClaudeCodeConfig | null>(null);
  const [claudeCodeCopySuccess, setClaudeCodeCopySuccess] = useState(false);
  const [listSuccess, setListSuccess] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyComment, setKeyComment] = useState("");
  const [keyDuration, setKeyDuration] = useState(30);
  const [showFullPageSpinner, setShowFullPageSpinner] = useState(false);
  const [spinnerMessage, setSpinnerMessage] = useState("");

  const listKeys = useCallback(async () => {
    try {
      const { data: res } = await getLLMKeys();
      const keysData = res.data && res.data[0] && res.data[0].details;
      setListSuccess(true);
      setKeys(Array.isArray(keysData) ? keysData : []);
    } catch (ex) {
      const errorMessage = getErrorMessage(ex, "Failed to load LLM tokens.");
      toast.error(errorMessage);
    }
  }, []);

  useEffect(() => {
    listKeys();
  }, [listKeys]);

  const generateChatboxConfig = async (
    apiKey: string
  ): Promise<ChatboxConfig | null> => {
    try {
      const { data: res } = await getLLMModels();
      const modelData = res.data && res.data[0] && res.data[0].details;
      const apiHost = modelData?.api_host || "";
      const models = (modelData?.models || []).map(
        (m: { modelId: string }) => ({
          modelId: m.modelId,
          capabilities: ["reasoning", "tool_use"],
          contextWindow: 131072,
        })
      );

      return {
        id: `fabric-llm-${crypto.randomUUID()}`,
        name: "FABRIC AI",
        type: "openai",
        settings: { apiHost, apiKey, models },
      };
    } catch {
      toast.warning("Could not fetch model list for Chatbox config.");
      return null;
    }
  };

  const generateClaudeCodeConfig = async (
    apiKey: string
  ): Promise<ClaudeCodeConfig | null> => {
    try {
      const { data: res } = await getLLMModels();
      const modelData = res.data && res.data[0] && res.data[0].details;
      const apiHost = modelData?.api_host || "";
      const models: Array<{ modelId: string }> = modelData?.models || [];

      const config: ClaudeCodeConfig = {
        env: {
          ANTHROPIC_BASE_URL: apiHost.endsWith("/v1")
            ? apiHost
            : `${apiHost}/v1`,
          ANTHROPIC_AUTH_TOKEN: apiKey,
        },
      };

      // Map first available model as the default
      if (models.length > 0) {
        config.env.ANTHROPIC_DEFAULT_SONNET_MODEL = models[0].modelId;
        config.env.ANTHROPIC_DEFAULT_HAIKU_MODEL =
          models.length > 1 ? models[1].modelId : models[0].modelId;
      }

      return config;
    } catch {
      toast.warning("Could not fetch model list for Claude Code config.");
      return null;
    }
  };

  const handleCreateKey = async (
    e: React.FormEvent,
    configType: "none" | "chatbox" | "claude" = "none"
  ) => {
    e.preventDefault();
    setShowFullPageSpinner(true);
    setSpinnerMessage("Creating LLM Token...");
    try {
      const { data: res } = await createLLMKey(
        keyName || null,
        keyComment || null,
        keyDuration
      );
      const keyData = res.data && res.data[0] && res.data[0].details;

      let chatboxCfg: ChatboxConfig | null = null;
      let claudeCfg: ClaudeCodeConfig | null = null;

      if (configType === "chatbox" && keyData?.api_key) {
        chatboxCfg = await generateChatboxConfig(keyData.api_key);
      }
      if (configType === "claude" && keyData?.api_key) {
        claudeCfg = await generateClaudeCodeConfig(keyData.api_key);
      }

      setCreateSuccess(true);
      setCreateCopySuccess(false);
      setCreatedKey(keyData);
      setChatboxConfig(chatboxCfg);
      setChatboxCopySuccess(false);
      setClaudeCodeConfig(claudeCfg);
      setClaudeCodeCopySuccess(false);
      setShowFullPageSpinner(false);
      setSpinnerMessage("");
      listKeys();
      toast.success("LLM token created successfully.");
    } catch (ex) {
      setShowFullPageSpinner(false);
      setSpinnerMessage("");
      const errorMessage = getErrorMessage(ex, "Failed to create LLM token.");
      toast.error(errorMessage);
    }
  };

  const handleDeleteKey = async (e: React.MouseEvent, keyId: string) => {
    e.preventDefault();
    try {
      await deleteLLMKey(keyId);
      toast.success("LLM token deleted successfully.");
      listKeys();
    } catch (ex) {
      const errorMessage = getErrorMessage(ex, "Failed to delete LLM token.");
      toast.error(errorMessage);
    }
  };

  const handleCopyApiKey = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (createdKey?.api_key) {
      const success = await copyToClipboard(createdKey.api_key);
      if (success) setCreateCopySuccess(true);
    }
  };

  const handleCopyChatboxConfig = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (chatboxConfig) {
      const success = await copyToClipboard(
        JSON.stringify(chatboxConfig, null, 2)
      );
      if (success) setChatboxCopySuccess(true);
    }
  };

  const handleDownloadChatboxConfig = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!chatboxConfig) return;
    const blob = new Blob([JSON.stringify(chatboxConfig, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chatbox-fabric-ai.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyClaudeCodeConfig = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (claudeCodeConfig) {
      const success = await copyToClipboard(
        JSON.stringify(claudeCodeConfig, null, 2)
      );
      if (success) setClaudeCodeCopySuccess(true);
    }
  };

  const handleDownloadClaudeCodeConfig = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!claudeCodeConfig) return;
    const blob = new Blob([JSON.stringify(claudeCodeConfig, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claude-code-settings.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (showFullPageSpinner) {
    return (
      <div className="container mx-auto min-h-[80vh] mt-8 mb-8">
        <SpinnerFullPage showSpinner text={spinnerMessage} />
      </div>
    );
  }

  return (
    <div className="container mx-auto min-h-[80vh] mt-8 mb-8 px-4">
      <div className="bg-fabric-primary/10 border border-fabric-primary/30 text-fabric-dark rounded p-4 mb-2 mt-4">
        Manage your LLM tokens for accessing FABRIC AI services. You must be a
        member of the FABRIC-LLM project to create tokens.
      </div>

      <h3 className="text-xl font-semibold my-3">Create LLM Token</h3>

      <div className="grid grid-cols-12 gap-4 items-end">
        <div className="col-span-3">
          <Label htmlFor="key-name">Key Name (optional)</Label>
          <Input
            id="key-name"
            type="text"
            placeholder="e.g., my-notebook-key"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
          />
        </div>
        <div className="col-span-3">
          <Label htmlFor="key-comment">Comment (optional)</Label>
          <Input
            id="key-comment"
            type="text"
            placeholder="e.g., Key for Jupyter notebook"
            value={keyComment}
            onChange={(e) => setKeyComment(e.target.value)}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="key-duration">Duration (days)</Label>
          <select
            id="key-duration"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={keyDuration}
            onChange={(e) => setKeyDuration(parseInt(e.target.value))}
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
        <div className="col-span-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={createSuccess}
            onClick={(e) => handleCreateKey(e, "none")}
            className="border-fabric-success text-fabric-success hover:bg-fabric-success/10"
          >
            Create Token
          </Button>
          <Button
            variant="outline"
            disabled={createSuccess}
            onClick={(e) => handleCreateKey(e, "chatbox")}
            className="border-fabric-primary text-fabric-primary hover:bg-fabric-primary/10"
          >
            + Chatbox Config
          </Button>
          <Button
            variant="outline"
            disabled={createSuccess}
            onClick={(e) => handleCreateKey(e, "claude")}
            className="border-fabric-dark text-fabric-dark hover:bg-fabric-dark/10"
          >
            + Claude Code Config
          </Button>
        </div>
      </div>

      {/* Created key display */}
      {createSuccess && createdKey && (
        <div className="mt-2">
          <Card>
            <CardHeader className="flex flex-row gap-2 bg-muted/50 py-3 px-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyApiKey}
                className="border-fabric-primary text-fabric-primary"
              >
                Copy API Key
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <Textarea
                id="llmApiKeyTextArea"
                defaultValue={createdKey.api_key}
                rows={2}
                readOnly
              />
            </CardContent>
          </Card>
          {createCopySuccess && (
            <Alert className="bg-fabric-success/10 border-fabric-success/30 mt-2">
              <AlertDescription>API key copied to clipboard!</AlertDescription>
            </Alert>
          )}
          <div className="bg-fabric-warning/10 border border-fabric-warning/30 text-fabric-dark rounded p-4 mb-2 mt-2">
            Save this API key now. It will not be shown again.
          </div>
        </div>
      )}

      {/* Chatbox config display */}
      {createSuccess && chatboxConfig && (
        <div className="mt-2">
          <Card>
            <CardHeader className="flex flex-row gap-2 bg-muted/50 py-3 px-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyChatboxConfig}
                className="border-fabric-primary text-fabric-primary"
              >
                Copy Chatbox Config
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadChatboxConfig}
              >
                Download JSON
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <Label>Chatbox Configuration</Label>
              <Textarea
                id="chatboxConfigTextArea"
                defaultValue={JSON.stringify(chatboxConfig, null, 2)}
                rows={12}
                readOnly
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
          {chatboxCopySuccess && (
            <Alert className="bg-fabric-success/10 border-fabric-success/30 mt-2">
              <AlertDescription>
                Chatbox config copied to clipboard!
              </AlertDescription>
            </Alert>
          )}
          <div className="bg-fabric-info/10 border border-fabric-info/30 text-fabric-dark rounded p-4 mb-2 mt-2">
            Import this configuration into Chatbox to connect to FABRIC AI
            services.
          </div>
        </div>
      )}

      {/* Claude Code config display */}
      {createSuccess && claudeCodeConfig && (
        <div className="mt-2">
          <Card>
            <CardHeader className="flex flex-row gap-2 bg-muted/50 py-3 px-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyClaudeCodeConfig}
                className="border-fabric-primary text-fabric-primary"
              >
                Copy Claude Code Config
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadClaudeCodeConfig}
              >
                Download JSON
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <Label>Claude Code Configuration (~/.claude/settings.json)</Label>
              <Textarea
                id="claudeCodeConfigTextArea"
                defaultValue={JSON.stringify(claudeCodeConfig, null, 2)}
                rows={10}
                readOnly
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
          {claudeCodeCopySuccess && (
            <Alert className="bg-fabric-success/10 border-fabric-success/30 mt-2">
              <AlertDescription>
                Claude Code config copied to clipboard!
              </AlertDescription>
            </Alert>
          )}
          <div className="bg-fabric-info/10 border border-fabric-info/30 text-fabric-dark rounded p-4 mb-2 mt-2">
            Save this to <code className="bg-muted px-1 rounded">~/.claude/settings.json</code> to
            configure Claude Code to use FABRIC AI services. Note: Claude Desktop
            does not support custom API providers directly.
          </div>
        </div>
      )}

      {/* Keys list */}
      <h3 className="text-xl font-semibold my-3">Your LLM Tokens</h3>
      <div className="mt-3">
        {listSuccess && keys.length > 0 ? (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key Alias</TableHead>
                  <TableHead>Key ID</TableHead>
                  <TableHead>Spend</TableHead>
                  <TableHead>Max Budget</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Expires At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {key.key_alias || key.key_name || "-"}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {key.token || key.llm_key_id || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {key.spend !== undefined && key.spend !== null
                        ? `$${parseFloat(String(key.spend)).toFixed(4)}`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {key.max_budget !== undefined && key.max_budget !== null
                        ? `$${parseFloat(String(key.max_budget)).toFixed(2)}`
                        : "Unlimited"}
                    </TableCell>
                    <TableCell>
                      {key.created_at ? toLocaleTime(key.created_at) : "-"}
                    </TableCell>
                    <TableCell>
                      {key.expires
                        ? toLocaleTime(key.expires)
                        : key.expires_at
                          ? toLocaleTime(key.expires_at)
                          : "Never"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-fabric-danger text-fabric-danger hover:bg-fabric-danger/10"
                        onClick={(e) =>
                          handleDeleteKey(
                            e,
                            key.token || key.llm_key_id || ""
                          )
                        }
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="bg-fabric-primary/10 border border-fabric-primary/30 text-fabric-dark rounded p-4 my-2">
            No LLM tokens found.
          </div>
        )}
      </div>
    </div>
  );
}
