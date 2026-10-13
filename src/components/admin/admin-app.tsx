"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Lock, LockOpen } from "lucide-react";
import { api } from "@/lib/client/api";
import { useBootstrap } from "@/lib/client/use-bootstrap";
import { PinDialog } from "../pin-dialog";
import { ChangePasswordDialog } from "../change-password-dialog";
import { BackupAdmin } from "./backup-admin";
import { ConcertsAdmin } from "./concerts-admin";
import { GroupsAdmin } from "./groups-admin";
import { SecurityAdmin } from "./security-admin";
import { SingersAdmin } from "./singers-admin";
import { VenuesAdmin } from "./venues-admin";

const TABS = [
  { id: "groups", label: "Stemmegrupper" },
  { id: "singers", label: "Sangere" },
  { id: "venues", label: "Lokasjoner" },
  { id: "concerts", label: "Konserter" },
  { id: "backup", label: "Sikkerhetskopi" },
  { id: "security", label: "Sikkerhet" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AdminApp() {
  const router = useRouter();
  const { data, error, reload, patch } = useBootstrap();
  const [tab, setTab] = useState<TabId>("singers");

  if (error && !data) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-danger">{error}</p>
        <button className="btn btn-primary" onClick={() => void reload()}>
          Prøv igjen
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted" role="status">
        Laster …
      </div>
    );
  }

  if (!data.admin) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <Lock className="h-10 w-10 text-muted" />
        <h1 className="text-xl font-semibold">Administrasjon</h1>
        <p className="max-w-sm text-sm text-muted">Området er beskyttet med dirigent- eller adminpassord.</p>
        <PinDialog onClose={() => router.push("/")} onSuccess={() => void reload()} />
      </div>
    );
  }

  const logout = async () => {
    await api("DELETE", "/api/auth").catch(() => {});
    router.push("/");
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <Link href="/" className="btn-icon" aria-label="Tilbake til oppstillingene">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex-1 text-lg font-semibold">Administrasjon</h1>
          <button className="btn" onClick={() => void logout()}>
            <LockOpen className="h-4 w-4" /> Lås
          </button>
        </div>
        <nav className="mt-2 flex gap-1 overflow-x-auto" aria-label="Administrasjon" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${
                tab === t.id ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 p-3 pb-10" role="tabpanel">
        {tab === "groups" && <GroupsAdmin groups={data.groups} onChange={(groups) => patch({ groups })} />}
        {tab === "singers" && (
          <SingersAdmin singers={data.singers} groups={data.groups} onChange={(singers) => patch({ singers })} />
        )}
        {tab === "venues" && <VenuesAdmin venues={data.venues} onChange={(venues) => patch({ venues })} />}
        {tab === "concerts" && (
          <ConcertsAdmin
            concerts={data.concerts}
            venues={data.venues}
            singers={data.singers}
            groups={data.groups}
            onChange={(concerts) => patch({ concerts })}
          />
        )}
        {tab === "backup" && <BackupAdmin onRestored={() => void reload()} />}
        {tab === "security" && (
          <SecurityAdmin superadmin={data.superadmin} onPasswordChanged={() => void reload()} />
        )}
      </main>

      {data.mustChangePassword && (
        <ChangePasswordDialog
          role={data.superadmin ? "superadmin" : "conductor"}
          isMandatory
          onSuccess={() => void reload()}
          onClose={() => void logout()}
        />
      )}
    </div>
  );
}
