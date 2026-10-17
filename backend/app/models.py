"""
Pydantic 模型：上传时校验、返回时序列化。

设计原则：**宽进严出**。
  用户填的东西尽量宽松（都可以不填，有默认值），但长度必须有上限，
  否则一张表里塞进几万字，前端播放时排版会炸、DB 也会被撑大。
"""

from pydantic import BaseModel, Field, field_validator, model_validator


class QuizQuestion(BaseModel):
    """一道默契挑战题（目前播放只用到蒙太奇，题目先存下来，留给后续版本）"""

    question: str = Field(min_length=1, max_length=120)
    options: list[str] = Field(min_length=2, max_length=6)
    answer: int = Field(default=0, ge=0)

    @field_validator("options")
    @classmethod
    def _trim_options(cls, value: list[str]) -> list[str]:
        cleaned = [str(o).strip()[:40] for o in value]
        if any(not o for o in cleaned):
            raise ValueError("选项不能为空")
        return cleaned

    @model_validator(mode="after")
    def _answer_within_range(self) -> "QuizQuestion":
        if self.answer >= len(self.options):
            raise ValueError("正确答案序号超出选项范围")
        return self


class AlbumPayload(BaseModel):
    """访客在创作页填的全部内容"""

    title: str = Field(default="我们的恋爱回忆录", max_length=30)
    author: str = Field(default="", max_length=20)  # 你的名字
    partner: str = Field(default="", max_length=20)  # 对方的名字
    met_at: str = Field(default="", max_length=20)  # 相识时间，自由文本，例如 2024.10.10
    message: str = Field(default="", max_length=200)  # 想说的话（放在结尾）
    ending_line: str = Field(default="遇见你，是我最幸运的事。", max_length=60)
    captions: list[str] = Field(default_factory=list)  # 与照片一一对应的字幕
    questions: list[QuizQuestion] = Field(default_factory=list, max_length=10)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        value = value.strip()
        return value or "我们的恋爱回忆录"

    @field_validator("ending_line")
    @classmethod
    def _ending_not_blank(cls, value: str) -> str:
        value = value.strip()
        return value or "遇见你，是我最幸运的事。"

    @field_validator("captions")
    @classmethod
    def _trim_captions(cls, value: list[str]) -> list[str]:
        if len(value) > 20:
            raise ValueError("字幕最多 20 条")
        return [str(c).strip()[:60] for c in value]


class PhotoOut(BaseModel):
    url: str
    width: int
    height: int


class CreateAlbumResponse(BaseModel):
    album_id: str
    share_url: str
    created_at: str
    photos: list[PhotoOut]


class AlbumResponse(BaseModel):
    album_id: str
    share_url: str
    created_at: str
    views: int
    config: AlbumPayload
    photos: list[PhotoOut]


class HealthResponse(BaseModel):
    ok: bool
    albums: int
    views: int
    max_photos: int
