"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { externalLinks } from "@/lib/external-links";
import {
  createLLMKey,
  getLLMKeys,
  deleteLLMKey,
  getLLMModels,
} from "@/services/credential-manager-service";
import { getLlmProjectName, featureFlags } from "@/lib/config";

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
    API_TIMEOUT_MS: string;
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: number;
    ANTHROPIC_MODEL: string;
    ANTHROPIC_SMALL_FAST_MODEL: string;
    ANTHROPIC_DEFAULT_SONNET_MODEL: string;
    ANTHROPIC_DEFAULT_OPUS_MODEL: string;
    ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
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
  const router = useRouter();

  useEffect(() => {
    if (!featureFlags.llmTokens) {
      router.replace("/");
    }
  }, [router]);

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
  const [availableModels, setAvailableModels] = useState<Array<{ modelId: string }>>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [showFullPageSpinner, setShowFullPageSpinner] = useState(false);
  const [spinnerMessage, setSpinnerMessage] = useState("");
  const [llmApiHost, setLlmApiHost] = useState("");

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
    const fetchModels = async () => {
      try {
        const { data: res } = await getLLMModels();
        const modelData = res.data && res.data[0] && res.data[0].details;
        const models: Array<{ modelId: string }> = modelData?.models || [];
        setAvailableModels(models);
        setSelectedModels(models.map((m) => m.modelId));
        if (modelData?.api_host) {
          setLlmApiHost(modelData.api_host);
        }
      } catch {
        // Models will default to empty; user can still create keys without restriction
      }
    };
    fetchModels();
  }, [listKeys]);

  const generateChatboxConfig = (
    apiKey: string,
    models: string[]
  ): ChatboxConfig => {
    const filteredModels = models.length > 0
      ? availableModels.filter((m) => models.includes(m.modelId))
      : availableModels;
    const configModels = filteredModels.map((m) => ({
      modelId: m.modelId,
      capabilities: ["reasoning", "tool_use"],
      contextWindow: 131072,
    }));

    return {
      id: `fabric-llm-${crypto.randomUUID()}`,
      name: "FABRIC AI",
      type: "openai",
      settings: { apiHost: llmApiHost, apiKey, models: configModels },
    };
  };

  const generateClaudeCodeConfig = (
    apiKey: string,
    models: string[]
  ): ClaudeCodeConfig => {
    const defaultModel = models.length > 0 ? models[0] : "default_model";
    const apiHost = llmApiHost.endsWith("/") ? llmApiHost : `${llmApiHost}/`;

    return {
      env: {
        ANTHROPIC_BASE_URL: apiHost,
        ANTHROPIC_AUTH_TOKEN: apiKey,
        API_TIMEOUT_MS: "3000000",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
        ANTHROPIC_MODEL: defaultModel,
        ANTHROPIC_SMALL_FAST_MODEL: defaultModel,
        ANTHROPIC_DEFAULT_SONNET_MODEL: defaultModel,
        ANTHROPIC_DEFAULT_OPUS_MODEL: defaultModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: defaultModel,
      },
    };
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowFullPageSpinner(true);
    setSpinnerMessage("Creating LLM Token...");
    try {
      const modelsParam = selectedModels.length > 0 ? selectedModels.join(",") : null;
      const { data: res } = await createLLMKey(
        keyName || null,
        keyComment || null,
        keyDuration,
        modelsParam
      );
      const keyData = res.data && res.data[0] && res.data[0].details;

      // Generate all configs eagerly so user can switch tabs freely
      let chatboxCfg: ChatboxConfig | null = null;
      let claudeCfg: ClaudeCodeConfig | null = null;
      if (keyData?.api_key) {
        chatboxCfg = generateChatboxConfig(keyData.api_key, selectedModels);
        claudeCfg = generateClaudeCodeConfig(keyData.api_key, selectedModels);
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

  const handleDeleteKey = async (keyId: string) => {
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
    a.download = "fabric-settings.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetCreateForm = () => {
    setCreateSuccess(false);
    setCreateCopySuccess(false);
    setCreatedKey(null);
    setChatboxConfig(null);
    setChatboxCopySuccess(false);
    setClaudeCodeConfig(null);
    setClaudeCodeCopySuccess(false);
    setKeyName("");
    setKeyComment("");
    setKeyDuration(30);
    setSelectedModels(availableModels.map((m) => m.modelId));
  };

  const modelsLabel =
    availableModels.length === 0
      ? "Loading..."
      : selectedModels.length === availableModels.length
        ? "All Models"
        : selectedModels.length === 0
          ? "None selected"
          : `${selectedModels.length} of ${availableModels.length} selected`;

  if (!featureFlags.llmTokens) {
    return null;
  }

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
        member of the <strong>{getLlmProjectName()}</strong> project to create tokens.
      </div>

      <h3 className="text-xl font-semibold my-3">Create LLM Token</h3>

      {/* Row 1: Name, Comment, Duration */}
      <div className="grid grid-cols-12 gap-4 items-end">
        <div className="col-span-4">
          <Label htmlFor="key-name">Key Name <span className="text-fabric-danger">*</span></Label>
          <Input
            id="key-name"
            type="text"
            placeholder="e.g., my-notebook-key"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            required
          />
        </div>
        <div className="col-span-4">
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
      </div>

      {/* Row 2: Models selector + Create button */}
      <div className="grid grid-cols-12 gap-4 items-end mt-3">
        <div className="col-span-8">
          <Label>Models</Label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setModelsOpen((prev) => !prev)}
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className={selectedModels.length === 0 ? "text-muted-foreground" : ""}>
                {modelsLabel}
              </span>
              <svg className="h-4 w-4 opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
            {modelsOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg">
                <div className="flex flex-col gap-0.5 p-2 max-h-48 overflow-y-auto">
                  <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={selectedModels.length === availableModels.length && availableModels.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedModels(availableModels.map((m) => m.modelId));
                        } else {
                          setSelectedModels([]);
                        }
                      }}
                      className="accent-[var(--fabric-primary)]"
                    />
                    <span className="font-medium">Select All</span>
                  </label>
                  <div className="border-t my-0.5" />
                  {availableModels.map((m) => (
                    <label key={m.modelId} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(m.modelId)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedModels((prev) => [...prev, m.modelId]);
                          } else {
                            setSelectedModels((prev) => prev.filter((id) => id !== m.modelId));
                          }
                        }}
                        className="accent-[var(--fabric-primary)]"
                      />
                      {m.modelId}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="col-span-4 flex justify-end">
          <Button
            disabled={createSuccess || !keyName.trim() || selectedModels.length === 0}
            onClick={handleCreateKey}
            className="bg-fabric-success hover:bg-fabric-success/90 text-white"
          >
            Create Token
          </Button>
        </div>
      </div>

      {/* Close dropdown when clicking outside */}
      {modelsOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setModelsOpen(false)} />
      )}

      {/* Created key display with tabbed configs */}
      {createSuccess && createdKey && (
        <div className="mt-4">
          <Tabs defaultValue="api-key">
            <TabsList>
              <TabsTrigger value="api-key">API Key</TabsTrigger>
              <TabsTrigger value="chatbox">Chatbox Config</TabsTrigger>
              <TabsTrigger value="claude-code">Claude Code Config</TabsTrigger>
            </TabsList>

            <TabsContent value="api-key">
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
            </TabsContent>

            <TabsContent value="chatbox">
              {chatboxConfig && (
                <>
                  <Card>
                    <CardHeader className="flex flex-row gap-2 bg-muted/50 py-3 px-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyChatboxConfig}
                        className="border-fabric-primary text-fabric-primary"
                      >
                        Copy Config
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
                    Import this configuration into{" "}
                    <a
                      href={externalLinks.chatbox}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fabric-primary underline"
                    >
                      Chatbox
                    </a>{" "}
                    to connect to FABRIC AI services.
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="claude-code">
              {claudeCodeConfig && (
                <>
                  <Card>
                    <CardHeader className="flex flex-row gap-2 bg-muted/50 py-3 px-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyClaudeCodeConfig}
                        className="border-fabric-primary text-fabric-primary"
                      >
                        Copy Config
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
                      <Label>Claude Code Configuration (~/.claude/fabric-settings.json)</Label>
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
                    Save this to <code className="bg-muted px-1 rounded">~/.claude/fabric-settings.json</code> and
                    run <code className="bg-muted px-1 rounded">claude --settings ~/.claude/fabric-settings.json</code> to
                    use FABRIC AI services with{" "}
                    <a
                      href={externalLinks.claudeCode}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fabric-primary underline"
                    >
                      Claude Code
                    </a>
                    . Note: Claude Desktop does not support custom API providers directly.
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          <div className="bg-fabric-warning/10 border border-fabric-warning/30 text-fabric-dark rounded p-4 mb-2 mt-2 flex items-center justify-between">
            <span>Save this API key now. It will not be shown again.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={resetCreateForm}
              className="border-fabric-success text-fabric-success hover:bg-fabric-success/10 ml-4 shrink-0"
            >
              Create Another Token
            </Button>
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
                        ? parseFloat(String(key.max_budget)).toFixed(2)
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
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-fabric-danger text-fabric-danger hover:bg-fabric-danger/10"
                          >
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete LLM Token</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete token{" "}
                              <strong>{key.key_alias || key.key_name || key.token || key.llm_key_id}</strong>?
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                handleDeleteKey(key.token || key.llm_key_id || "")
                              }
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
