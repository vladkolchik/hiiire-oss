"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseAdmin = getSupabaseAdmin;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("./env");
let cached = null;
function getSupabaseAdmin() {
    if (cached)
        return cached;
    const supabaseUrl = (0, env_1.requireEnv)("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = (0, env_1.requireEnv)("SUPABASE_SERVICE_ROLE_KEY");
    cached = (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: {
                "X-Client-Info": "hiiire/worker",
            },
        },
    });
    return cached;
}
