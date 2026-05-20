# DEPLOY 가이드

## 개요
- 이 앱은 정적 파일(`index.html`, `style.css`, `script.js`)만 배포하면 된다.
- 백엔드 서버는 없고, 데이터 저장과 인증은 Supabase를 사용한다.
- 런타임에서 Supabase JavaScript SDK는 CDN으로 불러온다.
- 배포 전 핵심 체크 포인트는 다음 3가지다.
  - Supabase `todos` 테이블과 RLS 정책 준비
  - Supabase Email Auth / Social Auth 설정 준비
  - 정적 사이트를 `http://` 또는 `https://`로 서비스

## 현재 앱 동작 요약
- 로그인하지 않은 사용자는 이메일 로그인/회원가입 또는 Google/GitHub 로그인 화면을 본다.
- 이메일 인증을 완료한 사용자만 로그인 후 Todo를 사용할 수 있다.
- Google/GitHub 로그인 사용자는 각 Provider 인증 후 바로 로그인할 수 있다.
- Todo CRUD와 드래그 정렬은 모두 Supabase `todos` 테이블에 저장된다.
- 기존 `localStorage["todos"]` 데이터는 더 이상 사용하지 않으며, 앱 시작 시 정리된다.
- OAuth 리다이렉트 진행 상태는 `sessionStorage["pending-oauth-provider"]`로 잠시 추적한다.

## 1. Supabase 준비

### 1-1. 프로젝트 확인
- 현재 연결된 Supabase URL:
  - `https://eecdvkrhokismqhcaoko.supabase.co`
- 현재 앱은 `script.js`에 anon key가 직접 들어 있다.
- 배포 전에 이 키가 실제 공개 배포용으로 괜찮은지 확인한다.
  - Supabase anon key는 클라이언트 노출이 가능한 키지만, RLS가 반드시 올바르게 걸려 있어야 한다.

### 1-2. `todos` 테이블 생성
- Supabase SQL Editor에서 아래 SQL을 실행한다.

```sql
create extension if not exists pgcrypto;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  priority text not null default 'medium',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint todos_priority_check
    check (priority in ('high', 'medium', 'low')),

  constraint todos_text_not_blank
    check (char_length(trim(text)) > 0)
);

create index if not exists todos_user_id_idx
on public.todos (user_id);

create index if not exists todos_user_priority_order_idx
on public.todos (user_id, priority, sort_order);

alter table public.todos enable row level security;
```

### 1-3. RLS 정책 생성
- 인증된 사용자만 자신의 Todo에 접근할 수 있게 설정한다.

```sql
create policy "Users can view their own todos"
on public.todos
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own todos"
on public.todos
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own todos"
on public.todos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own todos"
on public.todos
for delete
to authenticated
using (auth.uid() = user_id);
```

### 1-4. `updated_at` 트리거 추가

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_todos_updated_at on public.todos;

create trigger set_todos_updated_at
before update on public.todos
for each row
execute function public.set_updated_at();
```

## 2. Supabase Auth 준비

### 2-1. Email Auth 활성화
- Supabase Dashboard > `Authentication` > `Providers`에서 `Email`을 활성화한다.
- 현재 앱은 이메일/비밀번호 로그인과 Google/GitHub OAuth를 함께 사용한다.

### 2-2. Google / GitHub Auth 활성화
- Supabase Dashboard > `Authentication` > `Providers`에서 `Google`, `GitHub`를 활성화한다.
- Google Cloud Console에서 Web OAuth Client를 만들고 Client ID / Secret을 입력한다.
- GitHub Developer Settings에서 OAuth App을 만들고 Client ID / Secret을 입력한다.
- 두 Provider 모두 승인 후 돌아올 앱 URL을 Supabase `Redirect URLs`와 일치시켜야 한다.

### 2-3. 이메일 인증 활성화
- Supabase Dashboard > `Authentication` > `Providers` 또는 `Settings`에서 `Confirm email`을 켠다.
- 현재 앱은 회원가입 직후 자동 로그인하지 않는다.
- 사용자는 인증 메일을 확인한 뒤 로그인해야 한다.

### 2-4. Site URL / Redirect URL 설정
- Supabase Dashboard > `Authentication` > `URL Configuration`에서 실제 배포 URL을 등록한다.
- 예시:
  - `https://your-domain.com`
  - `https://your-project.pages.dev`
  - `https://your-app.netlify.app`
- 로컬 테스트 URL도 필요하면 함께 등록한다.
  - `http://localhost:8001`
- 소셜 로그인은 `redirectTo`로 현재 `origin + pathname`을 넘기므로, 실제 앱이 배포되는 정확한 경로까지 Redirect URLs 목록과 맞아야 한다.
- 쿼리스트링이나 해시를 Redirect URL 기준으로 삼지 않으므로, 라우팅 없이 정적 페이지 루트나 실제 파일 경로 기준으로 등록한다.

### 2-5. 메일 발송 제한 확인
- Supabase 기본 이메일 제공자는 메일 발송 제한이 매우 낮다.
- 기본 제공자 사용 시 회원가입/비밀번호 재설정 등 메일 발송 요청은 프로젝트 기준 시간당 2건 제한이 걸릴 수 있다.
- 테스트 중 이메일 오타가 자주 발생하거나 여러 사람이 동시에 검증하면 `email rate limit exceeded`가 발생할 수 있다.
- 운영 배포 전에는 Custom SMTP 설정을 강하게 권장한다.

## 3. 앱 설정 확인

### 3-1. 현재 하드코딩된 값
- [script.js](/home/ubuntu/work/kosa-vibecoding-2026-2nd/src/exercise/ryuboutintin/day03/todo/script.js:9)에 다음 값이 들어 있다.
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- 다른 Supabase 프로젝트로 배포할 경우 이 값을 먼저 교체해야 한다.

### 3-2. 브라우저 실행 조건
- 이 앱은 `file://`로 직접 열면 안 된다.
- 반드시 정적 웹서버나 정적 호스팅에서 `http://` 또는 `https://`로 열어야 한다.

### 3-3. CDN 접근 가능 여부
- `index.html`은 `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`를 직접 로드한다.
- 사내망 또는 네트워크 제한 환경이라면 이 CDN 접근이 가능한지 먼저 확인한다.

## 4. 로컬 검증

### 4-1. 로컬 서버 실행
- 이 디렉터리에서 아래 명령으로 정적 서버를 실행한다.

```bash
python3 -m http.server 8001
```

- 브라우저에서 아래 주소로 접속한다.

```text
http://localhost:8001
```

### 4-2. 확인할 항목
- 비로그인 상태에서 Todo UI 대신 인증 화면이 보이는지
- 인증 화면에서 Google/GitHub 버튼이 보이는지
- 회원가입 시 인증 메일 안내가 나오는지
- 이메일 인증 후 로그인 가능한지
- Google 로그인 후 앱으로 복귀해 Todo를 사용할 수 있는지
- GitHub 로그인 후 앱으로 복귀해 Todo를 사용할 수 있는지
- 로그인 후 Todo 추가/완료/우선순위 변경/드래그 정렬/삭제가 되는지
- 로그아웃 시 인증 화면으로 돌아가는지
- 서로 다른 계정으로 로그인했을 때 각자 자신의 Todo만 보이는지
- 새로고침 후에도 세션과 Todo 목록이 정상 복구되는지
- 소셜 로그인 실패 시 오류 문구가 보이고, 재시도 후 정상 복귀 가능한지

## 5. 정적 배포 방법

### 옵션 A. GitHub Pages
- 저장소에 현재 파일들을 푸시한다.
- GitHub Pages를 활성화한다.
- 배포 URL을 Supabase `Site URL`과 `Redirect URL`에 등록한다.

### 옵션 B. Netlify / Vercel / Cloudflare Pages
- 프로젝트 루트를 이 디렉터리로 지정하거나, 이 디렉터리만 배포 대상으로 올린다.
- 빌드 명령은 필요 없다.
- Publish Directory는 현재 파일이 있는 디렉터리로 맞춘다.
- 배포 후 생성된 도메인을 Supabase `Site URL`과 `Redirect URL`에 등록한다.

## 6. 배포 체크리스트
- `todos` 테이블 생성 완료
- RLS 정책 적용 완료
- Email Auth 활성화 완료
- Google Auth 활성화 완료
- GitHub Auth 활성화 완료
- Confirm email 활성화 완료
- 배포 URL이 Supabase URL 설정에 등록됨
- 로컬/운영 URL이 Redirect URLs에 등록됨
- 필요 시 Custom SMTP 설정 완료
- `script.js`의 Supabase URL/anon key가 실제 배포 대상과 일치함
- 브라우저에서 회원가입, 이메일 인증, 로그인, Todo CRUD까지 수동 검증 완료

## 7. 운영상 주의사항
- 현재 anon key는 클라이언트에 노출된다. 이는 정상적이지만, RLS가 깨지면 데이터가 노출될 수 있다.
- 메일 발송 제한 문제를 피하려면 운영 배포 전 Custom SMTP 설정을 권장한다.
- v1에서는 이메일 계정과 소셜 계정을 자동으로 링크하지 않으므로, 같은 이메일이어도 로그인 방식에 따라 별도 계정으로 취급될 수 있다.
- 정적 파일은 자체 서버가 없어도 되지만, Supabase API와 jsDelivr CDN에 브라우저에서 직접 접근할 수 있어야 한다.
- 향후 보안을 더 강화하려면:
  - 키를 직접 코드에 하드코딩하지 않고 배포 단계에서 치환
  - 비밀번호 재설정 기능 추가
  - 인증 성공/실패 UX 보강
