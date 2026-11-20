#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' '请在服务器上以 root 运行此脚本。' >&2
  exit 1
fi
if [ ! -t 0 ]; then
  printf '%s\n' '需要交互式终端，以隐藏方式输入密钥。不要通过命令行参数传入密钥。' >&2
  exit 1
fi
config_directory=/etc/xiaobu-learning
config_file="$config_directory/ai.env"
install -d -m 0700 "$config_directory"
exec 9>"$config_directory/configure.lock"
if ! flock -n 9; then
  printf '%s\n' '已有配置程序正在运行，请完成或退出该程序后重试。' >&2
  exit 1
fi
existing_provider=
existing_model=
if [ -e "$config_file" ]; then
  # Parse data without sourcing shell code or printing any stored credentials.
  existing_status=$(python3 - "$config_file" <<'PY'
import os, re, shlex, stat, sys
path = sys.argv[1]
info = os.lstat(path)
if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
    print('配置文件必须是 root 所有、权限0600的普通文件。', file=sys.stderr)
    sys.exit(1)
values = {}
with open(path, encoding='utf-8') as source:
    for line in source:
        line = line.strip()
        if line.startswith('export '):
            line = line[7:]
        name, separator, value = line.partition('=')
        if separator and name.strip() in ('STUDY_AI_PROVIDER', 'STUDY_AI_MODEL', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY'):
            try:
                parts = shlex.split(value, comments=True)
                values[name.strip()] = parts[0] if len(parts) == 1 else ''
            except ValueError:
                values[name.strip()] = ''
if values.get('DEEPSEEK_API_KEY') or values.get('OPENAI_API_KEY'):
    print('配置文件中已有密钥。为保留现有配置，本脚本不会覆盖。', file=sys.stderr)
    sys.exit(1)
provider = values.get('STUDY_AI_PROVIDER', '')
model = values.get('STUDY_AI_MODEL', '')
print(provider if provider in ('deepseek', 'openai') else '')
print(model if re.fullmatch(r'[A-Za-z0-9._:-]{1,100}', model) else '')
PY
  )
  existing_provider=$(printf '%s\n' "$existing_status" | sed -n '1p')
  existing_model=$(printf '%s\n' "$existing_status" | sed -n '2p')
  printf '%s\n' '检测到尚未包含密钥的配置；验证成功后会备份原文件并补齐配置。'
fi
printf '%s\n' '配置仅写入服务器私有环境文件，不会发到浏览器或项目仓库。'
default_provider=${existing_provider:-deepseek}
read -r -p "默认服务（deepseek / openai，回车选 $default_provider）：" study_provider
study_provider=${study_provider:-$default_provider}
case "$study_provider" in
  deepseek)
    study_model=deepseek-flash
    study_variable=DEEPSEEK_API_KEY
    study_endpoint=https://api.deepseek.com/models
    ;;
  openai)
    read -r -p '请输入已开通且支持图像的 OpenAI API 模型名称：' study_model
    if [ "$existing_provider" = openai ]; then study_model=${study_model:-$existing_model}; fi
    study_variable=OPENAI_API_KEY
    study_endpoint=https://api.openai.com/v1/models
    ;;
  *) printf '%s\n' '服务名称无效。' >&2; exit 1 ;;
esac
case "$study_model" in ''|*[!A-Za-z0-9._:-]*) printf '%s\n' '模型名称无效。' >&2; exit 1 ;; esac
read -r -s -p '请输入 API 密钥（输入不显示）：' study_key
printf '\n'
case "$study_key" in ''|*[!A-Za-z0-9._-]*) unset study_key; printf '%s\n' '密钥为空或包含不支持的字符，未保存。' >&2; exit 1 ;; esac
export STUDY_SETUP_KEY="$study_key" STUDY_SETUP_ENDPOINT="$study_endpoint" STUDY_SETUP_MODEL="$study_model"
python3 - <<'PY'
import os, urllib.request, urllib.error, json, sys
request=urllib.request.Request(os.environ['STUDY_SETUP_ENDPOINT'],headers={'Authorization':'Bearer '+os.environ['STUDY_SETUP_KEY']})
try:
    with urllib.request.urlopen(request,timeout=20) as response:
        result=json.load(response)
    available={item.get('id') for item in result.get('data',[])}
    if os.environ['STUDY_SETUP_MODEL'] not in available:
        print('密钥可连接，但指定模型不在可用列表中。配置未保存。',file=sys.stderr)
        sys.exit(1)
except urllib.error.HTTPError as error:
    print('接口验证失败，HTTP '+str(error.code)+'。配置未保存；不输出服务端响应或密钥。',file=sys.stderr)
    sys.exit(1)
except Exception:
    print('暂时无法连接模型接口。配置未保存。',file=sys.stderr)
    sys.exit(1)
print('密钥与模型列表验证通过。')
PY
unset STUDY_SETUP_KEY STUDY_SETUP_ENDPOINT STUDY_SETUP_MODEL
install -d -m 0700 "$config_directory"
temporary=$(mktemp "$config_directory/.ai.env.XXXXXX")
trap 'unset study_key; if [ -n "${temporary:-}" ] && [ -f "$temporary" ]; then rm -f "$temporary"; fi' EXIT
printf 'STUDY_AI_PROVIDER=%s\nSTUDY_AI_MODEL=%s\n%s=%s\n' "$study_provider" "$study_model" "$study_variable" "$study_key" > "$temporary"
unset study_key
chmod 0600 "$temporary"
if [ -e "$config_file" ]; then
  # Keep the incomplete settings until the new key has passed verification.
  backup_file=$(mktemp "$config_directory/ai.env.incomplete.XXXXXX")
  cp -- "$config_file" "$backup_file"
  chmod 0600 "$backup_file"
fi
mv "$temporary" "$config_file"
printf '%s\n' '配置已保存到 /etc/xiaobu-learning/ai.env（仅 root 可读）。'
printf '%s\n' '这一步仅配置服务访问；尚未启动真实上传、后台任务或语音服务。完成后告知开发者继续接通并验证。'
