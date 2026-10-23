# Third-party notices

## Fonts

The files in `fonts/` are subsets of the fonts below, downloaded from Google Fonts with
`tools/fetch-fonts.py`. Each is licensed under the SIL Open Font License, Version 1.1; the
license text with each copyright line is next to the fonts.

| File | Font | Copyright | License |
| --- | --- | --- | --- |
| `fonts/neon.woff2` | M PLUS Rounded 1c ExtraBold | Copyright 2016 The Rounded M+ Project Authors. | [OFL 1.1](fonts/OFL-mplus-rounded-1c.txt) |
| `fonts/display-ja.woff2` | Dela Gothic One | Copyright 2020 The Dela Gothic Project Authors | [OFL 1.1](fonts/OFL-dela-gothic-one.txt) |
| `fonts/display-zh.woff2` | ZCOOL QingKe HuangYou | Copyright 2018 The ZCOOL QingKe HuangYou Project Authors | [OFL 1.1](fonts/OFL-zcool-qingke-huangyou.txt) |
| `fonts/pixel.woff2` | DotGothic16 | Copyright 2020 The DotGothic16 Project Authors | [OFL 1.1](fonts/OFL-dotgothic16.txt) |

## Code

`js/physics.js` is a JavaScript port of the box-box collision and sequential-impulse solver from
Box2D-Lite by Erin Catto (https://github.com/erincatto/box2d-lite), extended with restitution
and a weld joint, used under the MIT License:

```text
MIT License

Copyright (c) 2019 Erin Catto

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
