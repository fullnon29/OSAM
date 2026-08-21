# 오샘재가복지센터 안드로이드 앱

방문 현장에서 태블릿·휴대폰으로 욕구사정을 작성·조회하기 위한 앱입니다.

앱은 배포된 웹(https://osamcare.com)을 그대로 띄웁니다.
따라서 **웹을 고치면 앱도 함께 바뀌고, 앱을 다시 배포할 필요가 없습니다.**
서류 폴더 일괄 업로드는 휴대폰에 서류가 없어 의미가 없으므로 넣지 않았습니다.
그 기능은 윈도우 프로그램(`desktop/`)이 맡습니다.

`mobile/www/index.html` 은 인터넷이 끊겼을 때 보여 줄 안내 화면입니다.

## 빌드에 필요한 것

- JDK 21 (Capacitor 가 Java 21 을 요구합니다)
- Android SDK: `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`

이 PC에는 아래에 설치되어 있습니다.

```
C:\osam-build\tools\jdk-21.0.12+8
C:\osam-build\tools\android-sdk
```

## 빌드 방법

Gradle 은 경로에 한글이 있으면 빌드를 거부합니다. 이 저장소는 `홈페이지`
폴더 안에 있으므로, 안드로이드 프로젝트를 한글이 없는 경로로 복사해 빌드합니다.

```bash
npx cap sync android                      # 웹 설정을 안드로이드 프로젝트에 반영

rm -rf /c/osam-build/app/android
cp -r android /c/osam-build/app/android
printf 'sdk.dir=C:/osam-build/tools/android-sdk\n' > /c/osam-build/app/android/local.properties

cd /c/osam-build/app/android
JAVA_HOME=/c/osam-build/tools/jdk-21.0.12+8 ./gradlew assembleDebug --no-daemon
```

결과: `app/build/outputs/apk/debug/app-debug.apk`

`local.properties` 는 반드시 정방향 슬래시로 씁니다. 역슬래시로 쓰면
`\o`, `\t` 가 이스케이프로 해석되어 경로가 깨집니다.

## 설치

지금 APK 는 디버그 서명입니다. 사내에서 나눠 쓰기에는 문제없지만,
Play 스토어에 올리려면 배포용 열쇠로 서명해야 합니다.

휴대폰에서 APK 파일을 열면 설치되며, 처음에는
**설정 → 출처를 알 수 없는 앱 설치 허용**이 필요할 수 있습니다.
