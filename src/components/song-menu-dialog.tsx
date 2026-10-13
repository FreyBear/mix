"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FilePlus2,
  Plus,
  Trash2,
} from "lucide-react";
import type { Scene } from "@/lib/types";
import { Modal } from "./modal";

interface SongMenuDialogProps {
  scene: Scene;
  sceneIndex: number;
  sceneCount: number;
  hasPrev: boolean;
  onTitle: (title: string) => void;
  onCopyPrev: () => void;
  onNewScene: (copy: boolean) => void;
  onDeleteScene: () => void;
  onMove: (dir: -1 | 1) => void;
  onClose: () => void;
}

export function SongMenuDialog({
  scene,
  sceneIndex,
  sceneCount,
  hasPrev,
  onTitle,
  onCopyPrev,
  onNewScene,
  onDeleteScene,
  onMove,
  onClose,
}: SongMenuDialogProps) {
  const [title, setTitle] = useState(scene.title);



  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== scene.title) {
      onTitle(v);
    }
  };

  const handleClose = () => {
    saveTitle();
    onClose();
  };

  return (
    <Modal title={`Sang ${sceneIndex + 1} av ${sceneCount}`} onClose={handleClose}>
      <div className="space-y-4">
        {/* Tittel */}
        <div>
          <label className="label" htmlFor="song-menu-title">
            Sangtittel
          </label>
          <div className="flex gap-2">
            <input
              id="song-menu-title"
              className="input flex-1"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  saveTitle();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            {title.trim() !== scene.title && title.trim().length > 0 && (
              <button
                type="button"
                className="btn btn-primary px-3 text-xs shrink-0"
                onClick={saveTitle}
              >
                Lagre tittel
              </button>
            )}
          </div>
        </div>

        {/* Ny sang */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Opprett ny sang
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                saveTitle();
                onNewScene(true);
                onClose();
              }}
            >
              <Plus className="h-4 w-4" /> Ny (kopi)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                saveTitle();
                onNewScene(false);
                onClose();
              }}
            >
              <FilePlus2 className="h-4 w-4" /> Ny (tom)
            </button>
          </div>
        </div>

        {/* Rekkefølge og kopiering */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Rekkefølge og oppstilling
          </div>
          <button
            type="button"
            className="btn w-full"
            onClick={() => {
              onCopyPrev();
              onClose();
            }}
            disabled={!hasPrev}
          >
            <Copy className="h-4 w-4" /> Kopier oppstilling fra forrige sang
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                saveTitle();
                onMove(-1);
              }}
              disabled={sceneIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" /> Flytt frem
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                saveTitle();
                onMove(1);
              }}
              disabled={sceneIndex >= sceneCount - 1}
            >
              Flytt bak <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Slett sang */}
        <div className="border-t border-line pt-2">
          <button
            type="button"
            className="btn w-full text-danger hover:bg-danger/10"
            onClick={() => {
              onDeleteScene();
              onClose();
            }}
            disabled={sceneCount <= 1}
          >
            <Trash2 className="h-4 w-4" /> Slett denne sangen
          </button>
        </div>
      </div>
    </Modal>
  );
}
