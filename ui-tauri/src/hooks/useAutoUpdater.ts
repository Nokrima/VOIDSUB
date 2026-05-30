import { useState, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useAppContext } from "../context/AppContext";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"
  | "up-to-date";

export function useAutoUpdater() {
  const { notify } = useAppContext();
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [versionInfo, setVersionInfo] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updater, setUpdater] = useState<any>(null);

  const checkForUpdates = useCallback(async () => {
    try {
      setStatus("checking");
      setErrorMsg(null);
      const update = await check();

      if (update) {
        setUpdater(update);
        setVersionInfo(update.version);
        setStatus("available");
        notify("success", `Yeni sürüm bulundu: v${update.version}`);
      } else {
        setStatus("up-to-date");
        notify("info", "Uygulamanız güncel.");
        setTimeout(() => setStatus("idle"), 4000);
      }
    } catch (err: any) {
      console.error("Update check failed:", err);
      setStatus("error");
      const msg = err.message || "Güncelleme denetlenemedi";
      setErrorMsg(msg);
      notify("error", `Güncelleme hatası: ${msg}`);
      setTimeout(() => setStatus("idle"), 5000);
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!updater) return;
    try {
      setStatus("downloading");
      setProgress(0);

      let downloaded = 0;
      let contentLength = 0;

      await updater.downloadAndInstall((event: any) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });

      setStatus("ready");
      notify(
        "success",
        "Güncelleme indirildi! Uygulama yeniden başlatılıyor...",
      );
      setTimeout(async () => {
        await relaunch();
      }, 2000);
    } catch (err: any) {
      console.error("Update installation failed:", err);
      setStatus("error");
      const msg = err.message || "Yükleme başarısız";
      setErrorMsg(msg);
      notify("error", `Yükleme hatası: ${msg}`);
      setTimeout(() => setStatus("idle"), 5000);
    }
  }, [updater]);

  return {
    status,
    progress,
    versionInfo,
    errorMsg,
    checkForUpdates,
    installUpdate,
  };
}
