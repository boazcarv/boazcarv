import { writeFile } from "node:fs/promises";

const username = "boazcarv";
const token = process.env.GITHUB_TOKEN;
const outputDir = new URL("../assets/", import.meta.url);

if (!token) {
  throw new Error("Defina GITHUB_TOKEN com um token de leitura da API do GitHub.");
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "boazcarv-profile-cards",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

const escapeXml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);

const number = (value) => new Intl.NumberFormat("pt-BR").format(value);
const baseStart = `
<svg xmlns="http://www.w3.org/2000/svg" width="495" height="220" viewBox="0 0 495 220" role="img"`;
const baseEnd = `
</svg>
`;
const cardFrame = `
  <rect x="1" y="1" width="493" height="218" rx="16" fill="#111827" stroke="#2a3548" stroke-width="2"/>
  <path d="M24 55h447" stroke="#2a3548"/>
`;
const cardText = `font-family="Inter,Segoe UI,Arial,sans-serif"`;

const profile = await github(`/users/${username}`);
const repos = [];
for (let page = 1; ; page += 1) {
  const batch = await github(`/users/${username}/repos?type=owner&per_page=100&sort=updated&page=${page}`);
  repos.push(...batch);
  if (batch.length < 100) break;
}

const nonForkedRepos = repos.filter((repo) => !repo.fork && repo.size > 0);
const stars = repos.filter((repo) => !repo.fork).reduce((sum, repo) => sum + repo.stargazers_count, 0);
const metrics = [
  { value: number(profile.public_repos), label: ["Repositórios", "públicos"] },
  { value: number(profile.followers), label: ["Seguidores"] },
  { value: number(stars), label: ["Estrelas", "recebidas"] },
];

const statsContent = metrics.map((metric, index) => {
  const x = 28 + index * 153;
  const label = metric.label.map((line, lineIndex) =>
    `<tspan x="${x}" dy="${lineIndex === 0 ? 0 : 17}">${escapeXml(line)}</tspan>`
  ).join("");
  return `
  <g ${cardText}>
    <text x="${x}" y="117" fill="#f3f6fc" font-size="32" font-weight="700">${escapeXml(metric.value)}</text>
    <text x="${x}" y="148" fill="#9aa8bd" font-size="13">${label}</text>
  </g>`;
}).join("");

const statsSvg = `${baseStart} aria-labelledby="stats-title stats-desc">
  <title id="stats-title">Estatísticas do GitHub de Boaz Carvalho</title>
  <desc id="stats-desc">${number(profile.public_repos)} repositórios públicos, ${number(profile.followers)} seguidores e ${number(stars)} estrelas recebidas.</desc>${cardFrame}
  <g ${cardText}>
    <text id="stats-title-visible" x="25" y="37" fill="#e8edf6" font-size="17" font-weight="650">Estatísticas do GitHub</text>
    <text x="470" y="37" fill="#55c7e8" font-size="12" text-anchor="end">@${username}</text>
  </g>${statsContent}
  <path d="M28 182h439" stroke="#2a3548"/>
  <path d="M28 182h74" stroke="#55c7e8" stroke-width="2"/>
${baseEnd}`;

const languageTotals = new Map();
for (let start = 0; start < nonForkedRepos.length; start += 5) {
  const chunk = nonForkedRepos.slice(start, start + 5);
  const results = await Promise.all(chunk.map(async (repo) => ({
    languages: await github(`/repos/${username}/${encodeURIComponent(repo.name)}/languages`),
  })));
  for (const { languages } of results) {
    for (const [language, bytes] of Object.entries(languages)) {
      languageTotals.set(language, (languageTotals.get(language) ?? 0) + bytes);
    }
  }
}

const languageColors = {
  "C++": "#f34b7d",
  CSS: "#563d7c",
  Go: "#00add8",
  HTML: "#e34c26",
  Java: "#b07219",
  JavaScript: "#f1e05a",
  "Jupyter Notebook": "#da5b0b",
  Kotlin: "#a97bff",
  PHP: "#4f5d95",
  Python: "#3572a5",
  Ruby: "#701516",
  Rust: "#dea584",
  Shell: "#89e051",
  TypeScript: "#3178c6",
};
const languageEntries = [...languageTotals.entries()]
  .sort((left, right) => right[1] - left[1])
  .slice(0, 5);
const totalBytes = [...languageTotals.values()].reduce((sum, bytes) => sum + bytes, 0);

const languageRows = languageEntries.length
  ? languageEntries.map(([language, bytes], index) => {
      const y = 82 + index * 27;
      const ratio = totalBytes ? bytes / totalBytes : 0;
      const barWidth = Math.max(2, Math.round(410 * ratio));
      const color = languageColors[language] ?? "#818cf8";
      return `
  <g ${cardText}>
    <text x="27" y="${y}" fill="#dce4f0" font-size="12.5">${escapeXml(language)}</text>
    <text x="468" y="${y}" fill="#9aa8bd" font-size="12" text-anchor="end">${(ratio * 100).toFixed(1)}%</text>
    <rect x="27" y="${y + 7}" width="441" height="5" rx="2.5" fill="#263247"/>
    <rect x="27" y="${y + 7}" width="${barWidth}" height="5" rx="2.5" fill="${color}"/>
  </g>`;
    }).join("")
  : `
  <text x="27" y="100" ${cardText} fill="#9aa8bd" font-size="13">Ainda não há dados públicos de linguagens.</text>`;

const languagesSvg = `${baseStart} aria-labelledby="languages-title languages-desc">
  <title id="languages-title">Linguagens mais usadas por Boaz Carvalho</title>
  <desc id="languages-desc">Distribuição das linguagens por bytes de código nos repositórios públicos não derivados.</desc>${cardFrame}
  <g ${cardText}>
    <text x="25" y="37" fill="#e8edf6" font-size="17" font-weight="650">Linguagens mais usadas</text>
    <text x="470" y="37" fill="#55c7e8" font-size="12" text-anchor="end">@${username}</text>
  </g>${languageRows}
${baseEnd}`;

await Promise.all([
  writeFile(new URL("github-stats.svg", outputDir), statsSvg),
  writeFile(new URL("top-languages.svg", outputDir), languagesSvg),
]);

console.log(`Cartões atualizados: ${languageEntries.length} linguagens, ${profile.public_repos} repositórios públicos.`);
