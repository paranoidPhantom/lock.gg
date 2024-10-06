import appConfig from "./app.config.json";
import SJDB from "simple-json-db";

export let systemOpen = false;
export let secondsLeft = 0;
export let accessToken: string | undefined = undefined;
const KV = new SJDB("./lock.gg.json");

import { createHash } from "crypto";
export const sha1 = (str: string) =>
    createHash("sha1").update(str).digest("hex");

//_____________________________________________
// Web Server module

import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
new Elysia()
    .use(staticPlugin({ assets: "./src/public", prefix: "" }))
    .get("/api/me", ({ headers: { cookie } }) => {
        if (!KV.has("hashedPassword")) {
            return `
			<h2>You need to set up a password</h2>
			<form hx-post="/api/set-password">
				<sl-input style="margin-bottom: 1rem" name="password" type="password" placeholder="Password"></sl-input>
				<sl-button type="submit">Set password</sl-button>
			</form>
			`;
        } else {
            if (accessToken && cookie) {
                if (cookie.includes(`access_token=${accessToken}`)) {
                    return `
					<h2>Welcome back!</h2>
					<div hx-get="/api/state" hx-trigger="every 1s" hx-swap="innerHTML"></div>
					<form hx-post="/api/unlock">
						<h3>
							Unlock for
							<sl-input style="margin-top: 1rem; margin-bottom: 1rem" name="time" type="number" placeholder="Time in minutes"></sl-input>
							<sl-button type="submit">Unlock</sl-button>
						</h3>
					</form>
					`;
                }
            }
            return `
			<h2>Log in</h2>
			<form hx-post="/api/login">
				<sl-input style="margin-bottom: 1rem" name="password" type="password" placeholder="Password"></sl-input>
				<sl-button type="submit">Log in</sl-button>
			</form>
			<hr>
			<div hx-get="/api/state" hx-trigger="every 1s" hx-swap="innerHTML"></div>
			`;
        }
    })
    .post("/api/set-password", ({ body: { password } }) => {
        if (!KV.has("hashedPassword")) {
            KV.set("hashedPassword", sha1(password));
            return `
			<h3>Password set</h3>
			`;
        }
    })
    .post("/api/login", ({ body: { password } }) => {
        if (KV.has("hashedPassword")) {
            if (sha1(password) === KV.get("hashedPassword")) {
                accessToken = sha1(Date.now().toString());
                return new Response(`<h3>Logged in</h3>`, {
                    status: 200,
                    headers: { "Set-Cookie": `access_token=${accessToken}` },
                });
            }
        }
        return "<h3>Wrong password</h3>";
    })
    .get("/api/state", () =>
        systemOpen
            ? `<h3>Locking in ${secondsLeft} seconds</h3>`
            : `<h3>Locked</h3>`
    )
    .post("/api/unlock", ({ body: { time }, headers: { cookie } }) => {
        if (accessToken && cookie) {
            if (cookie.includes(`access_token=${accessToken}`)) {
                systemOpen = true;
                secondsLeft += time * 60;
                return `
				<h3>Opened system for ${secondsLeft} seconds</h3>
				`;
            }
        }
    })
    .listen(appConfig.port);

//_____________________________________________

//_____________________________________________
// IP Listing module
import { networkInterfaces } from "os";

export const dashboardOnNetwork = () => {
    const nets = networkInterfaces();
    const results = Object.create(null); // Or just '{}', an empty object

    for (const name of Object.keys(nets)) {
        if (nets[name]) {
            for (const net of nets[name]) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
                const familyV4Value =
                    typeof net.family === "string" ? "IPv4" : 4;
                if (net.family === familyV4Value && !net.internal) {
                    if (!results[name]) {
                        results[name] = [];
                    }
                    results[name].push(net.address);
                }
            }
        }
    }

    console.log(results);

    const interfaces = Object.keys(results);

    const primaryInterface = results[interfaces[0]];

    return `http://${
        Array.isArray(primaryInterface) ? primaryInterface[0] : primaryInterface
    }:${appConfig.port}`;
};

//_____________________________________________

//_____________________________________________
// System management module

import { exec } from "child_process";
import { platform } from "os";

export const validationJob = async () => {
    if (!systemOpen) {
        if (platform() === "win32")
            exec("rundll32.exe user32.dll,LockWorkStation");
    } else {
        secondsLeft -= 10;
        secondsLeft = secondsLeft < 0 ? 0 : secondsLeft;
        if (secondsLeft === 0) {
            systemOpen = false;
        }
    }
};

//_____________________________________________

setInterval(validationJob, 10000);
console.warn(dashboardOnNetwork());
