"use client";

/**
 * Owner first.
 *
 * Creating or changing storage starts by choosing who it is for - a person or a
 * project - not by choosing a resource and then picking a "scope" from a
 * dropdown with a hint explaining what the scope means. The old page had
 * `subvolScope: "user" | "project"` inside a Create Subvolume card, and the
 * same shape inside the capabilities card; the second one is what let "Entire
 * Project" mean something nobody had looked at.
 */
import { useMemo, useState } from "react";
import { FolderGit2, Search, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Principal, StorageUser } from "@/lib/principals";

export interface ProjectOption {
  uuid: string;
  name: string;
}

interface Props {
  people: StorageUser[];
  projects: ProjectOption[];
  selected: Principal | null;
  onSelect: (p: Principal) => void;
  loading?: boolean;
}

const MAX_ROWS = 60;

export function PrincipalPicker({ people, projects, selected, onSelect, loading }: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const matchedPeople = useMemo(() => {
    if (!q) return people.slice(0, MAX_ROWS);
    return people
      .filter(
        (p) =>
          p.bastion_login.toLowerCase().includes(q) ||
          (p.name || "").toLowerCase().includes(q) ||
          (p.email || "").toLowerCase().includes(q)
      )
      .slice(0, MAX_ROWS);
  }, [people, q]);

  const matchedProjects = useMemo(() => {
    if (!q) return projects.slice(0, MAX_ROWS);
    return projects
      .filter((p) => p.name.toLowerCase().includes(q) || p.uuid.toLowerCase().includes(q))
      .slice(0, MAX_ROWS);
  }, [projects, q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search people by name, login or email — or projects by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people" className="gap-1">
            <User className="h-3 w-3" /> People
            <Badge variant="secondary" className="ml-1">{people.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-1">
            <FolderGit2 className="h-3 w-3" /> Projects
            <Badge variant="secondary" className="ml-1">{projects.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <PickerList
            empty={loading ? "Loading people…" : "No person matches that search."}
            truncated={!q && people.length > MAX_ROWS ? people.length - MAX_ROWS : 0}
          >
            {matchedPeople.map((p) => (
              <PickerRow
                key={p.uuid}
                active={selected?.kind === "user" && selected.uuid === p.uuid}
                title={p.name || p.bastion_login}
                subtitle={p.bastion_login}
                onClick={() =>
                  onSelect({
                    kind: "user",
                    uuid: p.uuid,
                    name: p.name || p.bastion_login,
                    email: p.email,
                    login: p.bastion_login,
                  })
                }
              />
            ))}
          </PickerList>
        </TabsContent>

        <TabsContent value="projects">
          <PickerList
            empty={loading ? "Loading projects…" : "No project matches that search."}
            truncated={!q && projects.length > MAX_ROWS ? projects.length - MAX_ROWS : 0}
          >
            {matchedProjects.map((p) => (
              <PickerRow
                key={p.uuid}
                active={selected?.kind === "project" && selected.uuid === p.uuid}
                title={p.name}
                subtitle={p.uuid}
                onClick={() => onSelect({ kind: "project", uuid: p.uuid, name: p.name })}
              />
            ))}
          </PickerList>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PickerList({
  children,
  empty,
  truncated,
}: {
  children: React.ReactNode[];
  empty: string;
  truncated: number;
}) {
  if (children.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="max-h-72 overflow-y-auto rounded-md border">
      {children}
      {truncated > 0 && (
        // Never silently show a prefix of the list: a picker that looks
        // complete and is not is how the wrong principal gets chosen.
        <p className="border-t p-2 text-xs text-muted-foreground">
          {truncated} more — refine the search to see them.
        </p>
      )}
    </div>
  );
}

function PickerRow({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-baseline justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent ${
        active ? "bg-accent" : ""
      }`}
    >
      <span className="font-medium">{title}</span>
      <span className="ml-3 truncate text-xs text-muted-foreground">{subtitle}</span>
    </button>
  );
}
