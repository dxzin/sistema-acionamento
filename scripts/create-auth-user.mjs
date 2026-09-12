import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const email = String(process.env.NEW_USER_EMAIL || "").trim().toLowerCase();
const password = String(process.env.NEW_USER_PASSWORD || "");
const name = String(process.env.NEW_USER_NAME || email.split("@")[0] || "OPERADOR").trim().toUpperCase();
const role = String(process.env.NEW_USER_ROLE || "operator").trim().toLowerCase();

if (!email || !password) throw new Error("Informe NEW_USER_EMAIL e NEW_USER_PASSWORD.");
if (!email.includes("@")) throw new Error("E-mail inválido.");
if (password.length < 6) throw new Error("A senha precisa ter ao menos 6 caracteres.");
if (!["operator", "supervisor", "admin"].includes(role)) throw new Error("Perfil inválido.");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let existing = null;
for (let page = 1; !existing; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  existing = data.users.find((user) => user.email?.toLowerCase() === email) || null;
  if (data.users.length < 1000) break;
}

let user = existing;
let action = "updated";
if (existing) {
  const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { ...existing.user_metadata, name, role },
  });
  if (error) throw error;
  user = data.user;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (error) throw error;
  user = data.user;
  action = "created";
}

if (!user) throw new Error("O Supabase não retornou o usuário criado.");

const { error: profileError } = await supabase.from("profiles").upsert({
  id: user.id,
  name,
  email,
  role,
}, { onConflict: "id" });
if (profileError) throw profileError;

console.log(JSON.stringify({ action, id: user.id, email, name, role, confirmed: Boolean(user.email_confirmed_at) }, null, 2));
