# ⚔️ Spell Arena

실시간 1vs1 마법 전투 게임

## 배포 방법 (Render.com)

### ✅ Static Site로 설정해야 합니다!

1. Render 대시보드 → **New +** → **Static Site** 선택
2. GitHub 레포 연결
3. 아래와 같이 설정:
   - **Build Command**: (비워두기)
   - **Publish Directory**: `.`
4. **Create Static Site** 클릭

### 파일 구조
```
/
├── index.html   ← 게임 파일
├── render.yaml  ← Render 설정
└── README.md
```

## 플레이 방법

- **이동**: WASD / 방향키 / 모바일 D패드
- **기본공격**: Space
- **스펠**: 1~4
- **크리처**: Q~R
- **멀티플레이**: 방 코드 공유 후 P2P 연결
