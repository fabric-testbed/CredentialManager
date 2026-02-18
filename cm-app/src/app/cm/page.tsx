"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  createIdToken,
  revokeToken,
  getTokenByProjectId,
  validateToken as validateTokenApi,
} from "@/services/credential-manager-service";
import { getProjects } from "@/services/core-api-service";
import { externalLinks, portalLinkMap } from "@/lib/external-links";
import { getEnvironment } from "@/lib/config";

interface Project {
  uuid: string;
  name: string;
  memberships: { is_token_holder: boolean };
}

interface TokenRecord {
  token_hash: string;
  comment: string;
  created_at: string;
  expires_at: string;
  state: string;
  created_from: string;
}

const SCOPE_OPTIONS = [
  { id: 1, value: "all", display: "All" },
  { id: 2, value: "cf", display: "Control Framework" },
  { id: 3, value: "mf", display: "Measurement Framework" },
];

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

function getTokenStateVariant(state: string) {
  if (state === "Revoked" || state === "Expired") return "destructive";
  if (state === "Valid" || state === "Refreshed") return "default";
  return "secondary";
}

function getTokenStateBg(state: string): string {
  if (state === "Revoked" || state === "Expired")
    return "bg-fabric-danger text-white";
  if (state === "Valid" || state === "Refreshed")
    return "bg-fabric-success text-white";
  return "bg-fabric-primary text-white";
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-HTTPS contexts
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

export default function CredentialManagerPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [createTokenResult, setCreateTokenResult] = useState("");
  const [tokenList, setTokenList] = useState<TokenRecord[]>([]);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createCopySuccess, setCreateCopySuccess] = useState(false);
  const [listSuccess, setListSuccess] = useState(false);
  const [selectedCreateScope, setSelectedCreateScope] = useState("all");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isTokenHolder, setIsTokenHolder] = useState(false);
  const [validateTokenValue, setValidateTokenValue] = useState("");
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [validateSuccess, setValidateSuccess] = useState(false);
  const [decodedToken, setDecodedToken] = useState("");
  const [tokenMsg, setTokenMsg] = useState("");
  const [inputLifetime, setInputLifetime] = useState(4);
  const [selectLifetimeUnit, setSelectLifetimeUnit] = useState("hours");
  const [tokenComment, setTokenComment] = useState("Created via GUI");
  const [showFullPageSpinner, setShowFullPageSpinner] = useState(false);
  const [spinnerMessage, setSpinnerMessage] = useState("");

  const portalLink = portalLinkMap[getEnvironment()];

  const listTokens = useCallback(async (projectId: string) => {
    try {
      const res = await getTokenByProjectId(projectId);
      setListSuccess(true);
      setTokenList(res.data.data);
    } catch (ex) {
      const errorMessage = getErrorMessage(ex, "Failed to get tokens.");
      toast.error(errorMessage);
    }
  }, []);

  useEffect(() => {
    async function loadProjects() {
      try {
        const userId = localStorage.getItem("cmUserID");
        if (!userId) return;
        const { data: res } = await getProjects(userId);
        const loadedProjects: Project[] = res.results;
        setProjects(loadedProjects);
        if (loadedProjects.length > 0) {
          const first = loadedProjects[0];
          setSelectedProjectId(first.uuid);
          setIsTokenHolder(first.memberships.is_token_holder);
          listTokens(first.uuid);
        }
      } catch (ex) {
        const errorMessage = getErrorMessage(
          ex,
          "Failed to load user's project information. Please reload this page."
        );
        toast.error(errorMessage);
      }
    }
    loadProjects();
  }, [listTokens]);

  const parseTokenLifetime = (): number => {
    if (selectLifetimeUnit === "hours") return inputLifetime;
    if (selectLifetimeUnit === "days") return inputLifetime * 24;
    if (selectLifetimeUnit === "weeks") return inputLifetime * 24 * 7;
    return inputLifetime;
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowFullPageSpinner(true);
    setSpinnerMessage("Creating Token...");
    try {
      const lifetime = parseTokenLifetime();
      const { data: res } = await createIdToken(
        selectedProjectId,
        selectedCreateScope,
        lifetime,
        tokenComment
      );
      setCreateCopySuccess(false);
      setCreateSuccess(true);
      setCreateTokenResult(JSON.stringify(res.data[0], undefined, 4));
      setShowFullPageSpinner(false);
      setSpinnerMessage("");
      listTokens(selectedProjectId);
      toast.success("Token created successfully.");
    } catch (ex) {
      setShowFullPageSpinner(false);
      setSpinnerMessage("");
      const errorMessage = getErrorMessage(ex, "Failed to create token.");
      toast.error(errorMessage);
    }
  };

  const handleRevokeToken = async (e: React.MouseEvent, tokenHash: string) => {
    e.preventDefault();
    try {
      await revokeToken("identity", tokenHash);
      listTokens(selectedProjectId);
      toast.success("Token revoked successfully.");
    } catch (ex) {
      const errorMessage = getErrorMessage(ex, "Failed to revoke token.");
      toast.error(errorMessage);
    }
  };

  const handleValidateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: res } = await validateTokenApi(validateTokenValue);
      setValidateSuccess(true);
      setIsTokenValid(true);
      setDecodedToken(res.token);
      setTokenMsg("Token is validated.");
    } catch (ex) {
      setValidateSuccess(true);
      setIsTokenValid(false);
      setDecodedToken("");
      const errorMessage = getErrorMessage(ex, "Failed to validate token.");
      toast.error(errorMessage);
    }
  };

  const handleCopyToken = async (e: React.MouseEvent) => {
    e.preventDefault();
    const success = await copyToClipboard(createTokenResult);
    if (success) setCreateCopySuccess(true);
  };

  const handleDownloadToken = (e: React.MouseEvent) => {
    e.preventDefault();
    const blob = new Blob([createTokenResult], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "id_token.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSelectProject = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const project = projects.find((p) => p.uuid === e.target.value);
    if (!project) return;
    setSelectedProjectId(project.uuid);
    setIsTokenHolder(project.memberships.is_token_holder);
    setCreateSuccess(false);
    setCreateCopySuccess(false);
    setInputLifetime(4);
    setSelectLifetimeUnit("hours");
    setSelectedCreateScope("all");
    setTokenComment("Created via GUI");
    listTokens(project.uuid);
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
      {projects.length === 0 && (
        <div className="bg-fabric-warning/10 border border-fabric-warning/30 text-fabric-dark rounded p-4 mt-4">
          <p className="mt-2">
            To manage tokens, you have to be in a project first:
          </p>
          <ul className="list-disc pl-6">
            <li>
              If you are a{" "}
              <a
                href={externalLinks.learnArticleStarterQuestions}
                target="_blank"
                rel="noreferrer"
              >
                professor or research staff member at your institution
              </a>
              , please{" "}
              <a href={portalLink} target="_blank" rel="noreferrer">
                request to be FABRIC Project Lead
              </a>{" "}
              from FABRIC Portal &rarr; User Profile &rarr; My Roles &amp;
              Projects page then you can create a project.
            </li>
            <li>
              If you are a{" "}
              <a
                href={externalLinks.learnArticleStarterQuestions}
                target="_blank"
                rel="noreferrer"
              >
                student or other contributor
              </a>
              , please ask your project lead to add you to a project.
            </li>
          </ul>
        </div>
      )}

      {projects.length > 0 && (
        <div>
          <div className="bg-fabric-primary/10 border border-fabric-primary/30 text-fabric-dark rounded p-4 mb-2">
            Please consult{" "}
            <a
              href={externalLinks.learnArticleFabricTokens}
              target="_blank"
              rel="noreferrer"
              className="font-bold"
            >
              this guide
            </a>{" "}
            for obtaining and using FABRIC API tokens.
          </div>

          <h3 className="text-xl font-semibold my-3">
            Create and List Tokens
          </h3>

          {/* Project selector */}
          <div className="mb-4">
            <Label htmlFor="project-select">Select Project</Label>
            <select
              id="project-select"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedProjectId}
              onChange={handleSelectProject}
            >
              {projects.map((project) => (
                <option key={project.uuid} value={project.uuid}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Token holder info */}
          <div
            className={`rounded p-4 my-2 ${
              !isTokenHolder
                ? "bg-fabric-success/10 border border-fabric-success/30"
                : "bg-fabric-success/10 border border-fabric-success/30"
            } text-fabric-dark`}
          >
            {!isTokenHolder ? (
              <span>
                The default token lifetime is 4 hours. To obtain{" "}
                <a
                  href={externalLinks.learnArticleLonglivedTokens}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold"
                >
                  long-lived tokens
                </a>{" "}
                for the selected project, please request access from{" "}
                <a href={portalLink} target="_blank" rel="noreferrer">
                  FABRIC Portal
                </a>
                .
              </span>
            ) : (
              <span>
                You have access to{" "}
                <a
                  href={externalLinks.learnArticleLonglivedTokens}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold"
                >
                  long-lived tokens
                </a>{" "}
                for this project. The lifetime limit is 9 weeks.
              </span>
            )}
          </div>

          {/* Create token form */}
          <form onSubmit={handleCreateToken}>
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-2">
                <Label htmlFor="lifetime">Lifetime</Label>
                <Input
                  id="lifetime"
                  type="number"
                  disabled={!isTokenHolder}
                  value={inputLifetime}
                  onChange={(e) => setInputLifetime(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="lifetime-unit">Unit</Label>
                <select
                  id="lifetime-unit"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectLifetimeUnit}
                  onChange={(e) => setSelectLifetimeUnit(e.target.value)}
                  disabled={!isTokenHolder}
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </div>
              <div className="col-span-3">
                <Label htmlFor="comment">Comment (10 - 100 characters)</Label>
                <Input
                  id="comment"
                  type="text"
                  value={tokenComment}
                  onChange={(e) => setTokenComment(e.target.value)}
                />
              </div>
              <div className="col-span-3">
                <Label htmlFor="scope">Select Scope</Label>
                <select
                  id="scope"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedCreateScope}
                  onChange={(e) => setSelectedCreateScope(e.target.value)}
                >
                  {SCOPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.value}>
                      {option.display}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 flex justify-end">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={createSuccess}
                  className="border-fabric-success text-fabric-success hover:bg-fabric-success/10"
                >
                  Create Token
                </Button>
              </div>
            </div>
          </form>

          {/* Created token display */}
          {createSuccess && (
            <div className="mt-2">
              <Card>
                <CardHeader className="flex flex-row gap-2 bg-muted/50 py-3 px-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToken}
                    className="border-fabric-primary text-fabric-primary"
                  >
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadToken}
                    className="border-fabric-primary text-fabric-primary"
                  >
                    Download
                  </Button>
                </CardHeader>
                <CardContent className="pt-4">
                  <Textarea
                    id="createTokenTextArea"
                    defaultValue={createTokenResult}
                    rows={6}
                    readOnly
                  />
                </CardContent>
              </Card>
              <div className="bg-fabric-warning/10 border border-fabric-warning/30 text-fabric-dark rounded p-4 mb-2 mt-2 flex items-center justify-between">
                <span>
                  If you need to use multiple tokens in parallel in e.g. separate
                  API sessions, please log out and log back in to generate new
                  tokens.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCreateSuccess(false);
                    setCreateCopySuccess(false);
                    setCreateTokenResult("");
                  }}
                  className="border-fabric-success text-fabric-success hover:bg-fabric-success/10 ml-4 shrink-0"
                >
                  Create Another Token
                </Button>
              </div>
            </div>
          )}

          {createCopySuccess && (
            <Alert className="bg-fabric-success/10 border-fabric-success/30 mt-2">
              <AlertDescription>Copied to clipboard successfully!</AlertDescription>
            </Alert>
          )}

          {/* Token list */}
          <div className="mt-3">
            {listSuccess && tokenList.length > 0 ? (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token Hash</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead>Expires At</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokenList.map((token, index) => (
                      <TableRow key={index}>
                        <TableCell className="max-w-[200px] truncate font-mono text-xs">
                          {token.token_hash}
                        </TableCell>
                        <TableCell>{token.comment}</TableCell>
                        <TableCell>{toLocaleTime(token.created_at)}</TableCell>
                        <TableCell>{toLocaleTime(token.expires_at)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={getTokenStateVariant(token.state)}
                            className={getTokenStateBg(token.state)}
                          >
                            {token.state}
                          </Badge>
                        </TableCell>
                        <TableCell>{token.created_from}</TableCell>
                        <TableCell>
                          {token.state !== "Revoked" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-fabric-danger text-fabric-danger hover:bg-fabric-danger/10"
                              onClick={(e) =>
                                handleRevokeToken(e, token.token_hash)
                              }
                            >
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="bg-fabric-primary/10 border border-fabric-primary/30 text-fabric-dark rounded p-4 my-2">
                No tokens available for the selected project.
              </div>
            )}
          </div>

          {/* Validate token section */}
          <h3 className="text-xl font-semibold my-3">
            Validate Identity Token
          </h3>
          <Card>
            <CardHeader className="bg-muted/50 py-3 px-4">
              Paste the token to validate:
            </CardHeader>
            <CardContent className="pt-4">
              <Textarea
                rows={3}
                id="validateTokenTextArea"
                value={validateTokenValue}
                onChange={(e) => {
                  setValidateTokenValue(e.target.value);
                  setIsTokenValid(false);
                }}
              />
            </CardContent>
          </Card>

          {validateSuccess && isTokenValid && (
            <>
              <Alert className="bg-fabric-success/10 border-fabric-success/30 mt-2">
                <AlertDescription>{tokenMsg}</AlertDescription>
              </Alert>
              <div className="mt-2">
                <Label>Decoded Token:</Label>
                <Textarea
                  rows={6}
                  value={JSON.stringify(decodedToken, undefined, 4)}
                  readOnly
                />
              </div>
            </>
          )}

          {validateSuccess &&
            !isTokenValid &&
            validateTokenValue !== "" && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription>Token is invalid!</AlertDescription>
              </Alert>
            )}

          <Button
            variant="outline"
            className="mt-3 border-fabric-primary text-fabric-primary hover:bg-fabric-primary/10"
            onClick={handleValidateToken}
          >
            Validate Token
          </Button>
        </div>
      )}
    </div>
  );
}
