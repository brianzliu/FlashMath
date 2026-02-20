export async function confirmDestructive(
  message: string,
  title = "Please Confirm"
): Promise<boolean> {
  try {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    return await confirm(message, {
      title,
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
  } catch {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return window.confirm(message);
    }
    return false;
  }
}
