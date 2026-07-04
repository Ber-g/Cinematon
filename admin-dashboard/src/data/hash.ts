// Empreinte SHA-256 d'un fichier, calculée côté client (Web Crypto). Sert au
// dedup (unique par org, imposé par la base) ET de base d'intégrité. Le calcul
// se fait dans le navigateur avant tout upload — le doublon est détecté d'emblée.

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
