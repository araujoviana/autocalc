import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { supportedServices } from "./services/index.ts";
import { REGION_LOCATIONS } from "./regions.ts";
import { CalculatorError } from "./errors.ts";

export type ShellType = "bash" | "zsh" | "fish";

export const COMMANDS: Array<{ name: string; description: string }> = [
  { name: "services", description: "List calculator services" },
  { name: "regions", description: "List calculator regions" },
  { name: "describe", description: "Describe service availability" },
  { name: "search", description: "Search SKUs (--billing, --vcpus, --mem, --limit, --refresh)" },
  { name: "quote", description: "Price service:spec[*qty][@size] items in USD (--currency)" },
  { name: "convert", description: "Convert a USD amount using Huawei Cloud FX rates" },
  { name: "compare-modes", description: "Compare ondemand, monthly, and yearly pricing" },
  { name: "compare-regions", description: "Compare item pricing across multiple regions" },
  { name: "supported", description: "List supported card builders and verification status" },
  { name: "compile", description: "Compile a version '1' quote file offline (<50ms)" },
  { name: "plan", description: "Validate quote YAML, resolve SKUs, rate, and write lockfile" },
  { name: "apply", description: "Encode cards, save list, run 3-way publish gate, return link" },
  { name: "export", description: "Export shared lists into a 4-sheet .xlsx workbook" },
  { name: "read", description: "Read a shared price list anonymously" },
  { name: "validate", description: "Re-read a shared list and check for arithmetic glitches" },
  { name: "edit-check", description: "Re-price saved cards in headless Edit view (--limit)" },
  { name: "login", description: "Open a browser window to sign in to Huawei Cloud" },
  { name: "logout", description: "Clear the current profile session" },
  { name: "auth", description: "Inspect authentication session status" },
  { name: "lists", description: "List saved price lists in your Huawei Cloud account" },
  { name: "rename", description: "Rename a saved price list" },
  { name: "duplicate", description: "Duplicate a saved price list (--name)" },
  { name: "delete", description: "Delete a saved price list (--yes)" },
  { name: "doctor", description: "Check endpoints, frontend version, browser, and cache" },
  { name: "completion", description: "Generate shell completion script (bash, zsh, fish)" },
  { name: "schema", description: "Inspect or refresh service card schemas (pull, coverage, diff)" },
  { name: "update", description: "Upgrade autocalc to the newest release tag" },
  { name: "install-browser", description: "Install Playwright's pinned Chromium browser" },
];

export function getServiceNames(): string[] {
  return supportedServices().map(s => s.service).sort();
}

export function getRegionIds(): string[] {
  return Object.keys(REGION_LOCATIONS).sort();
}

export function detectShell(envShell?: string): ShellType {
  const target = envShell || process.env.SHELL || "";
  if (target.includes("zsh")) return "zsh";
  if (target.includes("fish")) return "fish";
  return "bash";
}

export function generateBashCompletion(): string {
  const cmdNames = COMMANDS.map(c => c.name).join(" ");
  const services = getServiceNames().join(" ");
  const regions = getRegionIds().join(" ");

  return `# Bash completion for autocalc
# Generated automatically by 'autocalc completion bash'
#
# Installation:
#   To load in the current session:
#     source <(autocalc completion bash)
#
#   To install persistently:
#     autocalc completion bash > ~/.local/share/bash-completion/completions/autocalc
#     # or:
#     autocalc completion bash | sudo tee /etc/bash_completion.d/autocalc > /dev/null

_autocalc_completions() {
    local cur prev words cword
    if declare -F _init_completion >/dev/null 2>&1; then
        _init_completion || return
    else
        COMPREPLY=()
        cur="\${COMP_WORDS[COMP_CWORD]}"
        prev="\${COMP_WORDS[COMP_CWORD-1]}"
        words=("\${COMP_WORDS[@]}")
        cword=$COMP_CWORD
    fi

    local commands="${cmdNames}"
    local global_opts="--profile --headed --json --version -h --help"
    local services="${services}"
    local regions="${regions}"
    local billing_modes="ondemand monthly yearly"
    local schema_actions="pull coverage diff"
    local shells="bash zsh fish"

    case "$prev" in
        --billing)
            COMPREPLY=( $(compgen -W "$billing_modes" -- "$cur") )
            return 0
            ;;
        --path|--items)
            COMPREPLY=( $(compgen -f -X '!*.@(yaml|yml|json)' -- "$cur") )
            return 0
            ;;
        completion)
            COMPREPLY=( $(compgen -W "$shells" -- "$cur") )
            return 0
            ;;
        schema)
            COMPREPLY=( $(compgen -W "$schema_actions" -- "$cur") )
            return 0
            ;;
        auth)
            COMPREPLY=( $(compgen -W "status" -- "$cur") )
            return 0
            ;;
    esac

    # Find the active subcommand (first non-option word after autocalc)
    local cmd=""
    local cmd_idx=0
    local i
    for ((i=1; i < cword; i++)); do
        if [[ "\${words[i]}" != -* ]]; then
            cmd="\${words[i]}"
            cmd_idx=$i
            break
        fi
    done

    # If no subcommand entered yet
    if [[ -z "$cmd" ]]; then
        if [[ "$cur" == -* ]]; then
            COMPREPLY=( $(compgen -W "$global_opts" -- "$cur") )
        else
            COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
        fi
        return 0
    fi

    # Subcommand specific completions
    case "$cmd" in
        compile|plan|apply)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "--path --name --help" -- "$cur") )
            else
                COMPREPLY=( $(compgen -f -X '!*.@(yaml|yml)' -- "$cur") )
            fi
            return 0
            ;;
        services|describe)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "--region --help" -- "$cur") )
            else
                COMPREPLY=( $(compgen -W "$services" -- "$cur") )
            fi
            return 0
            ;;
        regions)
            COMPREPLY=( $(compgen -W "$services" -- "$cur") )
            return 0
            ;;
        search)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "--billing --vcpus --mem --limit --refresh --help" -- "$cur") )
            elif [[ $cword -eq $((cmd_idx+1)) ]]; then
                COMPREPLY=( $(compgen -W "$services" -- "$cur") )
            elif [[ $cword -eq $((cmd_idx+2)) ]]; then
                COMPREPLY=( $(compgen -W "$regions" -- "$cur") )
            fi
            return 0
            ;;
        quote)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "--billing --hours --periods --currency --help" -- "$cur") )
            elif [[ $cword -eq $((cmd_idx+1)) ]]; then
                COMPREPLY=( $(compgen -W "$regions" -- "$cur") )
            fi
            return 0
            ;;
        schema)
            if [[ $cword -eq $((cmd_idx+1)) ]]; then
                COMPREPLY=( $(compgen -W "$schema_actions" -- "$cur") )
            elif [[ $cword -eq $((cmd_idx+2)) ]]; then
                COMPREPLY=( $(compgen -W "$services" -- "$cur") )
            else
                COMPREPLY=( $(compgen -W "--json --help" -- "$cur") )
            fi
            return 0
            ;;
        completion)
            COMPREPLY=( $(compgen -W "$shells" -- "$cur") )
            return 0
            ;;
        auth)
            COMPREPLY=( $(compgen -W "status" -- "$cur") )
            return 0
            ;;
        compare-modes)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "--items --region --modes --currency --hours --periods --help" -- "$cur") )
            fi
            return 0
            ;;
        compare-regions)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "--items --regions --billing --help" -- "$cur") )
            fi
            return 0
            ;;
        delete)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "--yes --help" -- "$cur") )
            fi
            return 0
            ;;
        duplicate)
            if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "--name --help" -- "$cur") )
            fi
            return 0
            ;;
    esac

    if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "$global_opts" -- "$cur") )
    fi
}
complete -F _autocalc_completions autocalc
`;
}

export function generateZshCompletion(): string {
  const cmdList = COMMANDS.map(c => `        '${c.name}:${c.description.replace(/'/g, "")}'`).join("\n");
  const services = getServiceNames().join(" ");
  const regions = getRegionIds().join(" ");

  return `#compdef autocalc
# Zsh completion for autocalc
# Generated automatically by 'autocalc completion zsh'
#
# Installation:
#   To load in the current session:
#     source <(autocalc completion zsh)
#
#   To install persistently:
#     autocalc completion zsh > ~/.zsh/completion/_autocalc
#     # (ensure ~/.zsh/completion is in your $fpath)

_autocalc() {
    local -a commands
    commands=(
${cmdList}
    )

    local -a services
    services=(${services})

    local -a regions
    regions=(${regions})

    local -a billing_modes
    billing_modes=(ondemand monthly yearly)

    local -a shells
    shells=(bash zsh fish)

    _arguments -C \\
        '--profile[Authentication profile]:profile name:' \\
        '--headed[Show browser windows during automation]' \\
        '--json[Print structured JSON output]' \\
        '--version[Print version number]' \\
        '(-h --help)'{-h,--help}'[Show help]' \\
        '1:command:->command' \\
        '*::args:->args'

    case $state in
        command)
            _describe -t commands 'autocalc commands' commands
            ;;
        args)
            case $words[1] in
                compile|plan|apply)
                    _arguments \\
                        '--path[Path to quote YAML file]:file:_files -g "*.yaml *.yml"' \\
                        '--name[Override list name]:name:' \\
                        '1:quote file:_files -g "*.yaml *.yml"'
                    ;;
                services|describe)
                    _arguments \\
                        '--region[Filter by region]:region:($regions)' \\
                        '1:service:($services)'
                    ;;
                regions)
                    _arguments \\
                        '1:service:($services)'
                    ;;
                search)
                    _arguments \\
                        '--billing[Billing mode]:billing:($billing_modes)' \\
                        '--vcpus[Minimum vCPUs]:count:' \\
                        '--mem[Minimum memory in GB]:gb:' \\
                        '--limit[Result limit]:count:' \\
                        '--refresh[Bypass catalog cache]' \\
                        '1:service:($services)' \\
                        '2:region:($regions)' \\
                        '*:terms:'
                    ;;
                quote)
                    _arguments \\
                        '--billing[Billing mode]:billing:($billing_modes)' \\
                        '--hours[Hours for ondemand]:hours:' \\
                        '--periods[Periods count]:count:' \\
                        '--currency[Display currency code]:currency:(USD BRL EUR CNY MXN CLP)' \\
                        '1:region:($regions)' \\
                        '*:items:'
                    ;;
                schema)
                    _arguments \\
                        '--json[Print JSON]' \\
                        '1:action:(pull coverage diff)' \\
                        '2:service:($services)'
                    ;;
                completion)
                    _arguments \\
                        '1:shell:($shells)'
                    ;;
                auth)
                    _arguments \\
                        '1:subcommand:(status)'
                    ;;
                delete)
                    _arguments \\
                        '--yes[Confirm deletion]' \\
                        '1:url_or_id:'
                    ;;
                duplicate)
                    _arguments \\
                        '--name[New list name]:name:' \\
                        '1:url_or_id:'
                    ;;
            esac
            ;;
    esac
}

if [ "$funcstack[1]" = "_autocalc" ]; then
    _autocalc "$@"
else
    compdef _autocalc autocalc
fi
`;
}

export function generateFishCompletion(): string {
  const services = getServiceNames().join(" ");
  const regions = getRegionIds().join(" ");

  const lines: string[] = [
    `# Fish completion for autocalc`,
    `# Generated automatically by 'autocalc completion fish'`,
    `#`,
    `# Installation:`,
    `#   autocalc completion fish > ~/.config/fish/completions/autocalc.fish`,
    ``,
    `function __autocalc_needs_command`,
    `    set -l cmd (commandline -opc)`,
    `    if test (count $cmd) -eq 1`,
    `        return 0`,
    `    end`,
    `    return 1`,
    `end`,
    ``,
    `function __autocalc_using_command`,
    `    set -l cmd (commandline -opc)`,
    `    if test (count $cmd) -gt 1`,
    `        if test $cmd[2] = $argv[1]`,
    `            return 0`,
    `        end`,
    `    end`,
    `    return 1`,
    `end`,
    ``,
    `complete -c autocalc -f`,
    ``,
    `# Global options`,
    `complete -c autocalc -l profile -d "Authentication profile"`,
    `complete -c autocalc -l headed -d "Show browser windows"`,
    `complete -c autocalc -l json -d "Print structured JSON"`,
    `complete -c autocalc -s h -l help -d "Show help"`,
    `complete -c autocalc -l version -d "Print version"`,
    ``,
    `# Top-level commands`,
  ];

  for (const cmd of COMMANDS) {
    lines.push(`complete -c autocalc -n '__autocalc_needs_command' -a "${cmd.name}" -d "${cmd.description.replace(/"/g, '\\"')}"`);
  }

  lines.push(
    ``,
    `# Subcommand: completion`,
    `complete -c autocalc -n '__autocalc_using_command completion' -a "bash zsh fish" -d "Shell"`,
    ``,
    `# Subcommand: auth`,
    `complete -c autocalc -n '__autocalc_using_command auth' -a "status" -d "Show session status"`,
    ``,
    `# Subcommand: schema`,
    `complete -c autocalc -n '__autocalc_using_command schema' -a "pull coverage diff" -d "Action"`,
    `complete -c autocalc -n '__autocalc_using_command schema' -a "${services}" -d "Service"`,
    ``,
    `# Services & Regions completions`,
    `complete -c autocalc -n '__autocalc_using_command services' -a "${services}" -d "Service"`,
    `complete -c autocalc -n '__autocalc_using_command describe' -a "${services}" -d "Service"`,
    `complete -c autocalc -n '__autocalc_using_command regions' -a "${services}" -d "Service"`,
    `complete -c autocalc -n '__autocalc_using_command search' -a "${services}" -d "Service"`,
    `complete -c autocalc -n '__autocalc_using_command quote' -a "${regions}" -d "Region ID"`,
    ``,
    `# Quote file commands (allow file completions)`,
    `complete -c autocalc -n '__autocalc_using_command compile' -F`,
    `complete -c autocalc -n '__autocalc_using_command plan' -F`,
    `complete -c autocalc -n '__autocalc_using_command apply' -F`,
    ``,
  );

  return lines.join("\n");
}

export function generateCompletion(shell?: string): string {
  const chosen = (shell ? shell.toLowerCase() : detectShell()) as ShellType;
  switch (chosen) {
    case "bash":
      return generateBashCompletion();
    case "zsh":
      return generateZshCompletion();
    case "fish":
      return generateFishCompletion();
    default:
      throw new CalculatorError("VALIDATION", `Unsupported shell: ${shell}`, "Choose from: bash, zsh, fish.");
  }
}

export async function installCompletion(shell?: string, homeDir = homedir()): Promise<{ path: string; message: string }> {
  const chosen = (shell ? shell.toLowerCase() : detectShell()) as ShellType;
  const script = generateCompletion(chosen);

  if (chosen === "fish") {
    const dir = join(homeDir, ".config", "fish", "completions");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "autocalc.fish");
    await writeFile(file, script, "utf-8");
    return {
      path: file,
      message: `Installed fish completions to ${file}.\nTab completion is active immediately.`,
    };
  }

  if (chosen === "bash") {
    const dir = join(homeDir, ".local", "share", "bash-completion", "completions");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "autocalc");
    await writeFile(file, script, "utf-8");
    return {
      path: file,
      message: `Installed bash completions to ${file}.\nOpen a new shell or run 'source ${file}' to activate.`,
    };
  }

  if (chosen === "zsh") {
    const dir = join(homeDir, ".zsh", "completions");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "_autocalc");
    await writeFile(file, script, "utf-8");
    return {
      path: file,
      message: `Installed zsh completions to ${file}.\nEnsure ~/.zsh/completions is in your fpath, or add 'source <(autocalc completion zsh)' to ~/.zshrc.`,
    };
  }

  throw new CalculatorError("VALIDATION", `Unsupported shell: ${shell}`, "Choose from: bash, zsh, fish.");
}
