// Native Qt 6 quick panel (KDE Plasma and other Qt desktops). Started by Lightwarden, talks JSON lines on
// stdin/stdout (see src/quick.rs).
#include <QApplication>
#include <QGuiApplication>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLabel>
#include <QLineEdit>
#include <QListWidget>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QPixmap>
#include <QPushButton>
#include <QScreen>
#include <QStackedWidget>
#include <QToolButton>
#include <QVBoxLayout>
#include <QHash>
#include <QIcon>
#include <QKeyEvent>
#include <QPointer>
#include <functional>
#include <iostream>
#include <map>
#include <string>
#include <thread>

using Reply = std::function<void(const QJsonObject &)>;

class Panel : public QWidget {
public:
    Panel() : QWidget(nullptr, Qt::Popup | Qt::FramelessWindowHint) {
        resize(360, 520);
        auto *root = new QVBoxLayout(this);
        root->setContentsMargins(0, 0, 0, 0);
        root->setSpacing(0);
        stack = new QStackedWidget;
        root->addWidget(stack, 1);

        auto *open = new QWidget;
        auto *ol = new QVBoxLayout(open);
        ol->setContentsMargins(8, 8, 8, 4);
        search = new QLineEdit;
        search->setClearButtonEnabled(true);
        error = new QLabel;
        error->setStyleSheet("color: #d33");
        error->setWordWrap(true);
        list = new QListWidget;
        list->setSelectionMode(QAbstractItemView::NoSelection);
        list->setFrameShape(QFrame::NoFrame);
        ol->addWidget(search);
        ol->addWidget(error);
        ol->addWidget(list, 1);
        stack->addWidget(open);  // 0

        auto *lk = new QWidget;
        auto *ll = new QVBoxLayout(lk);
        ll->setContentsMargins(40, 0, 40, 0);
        ll->setAlignment(Qt::AlignVCenter);
        email = new QLabel;
        email->setAlignment(Qt::AlignCenter);
        secret = new QLineEdit;
        secret->setEchoMode(QLineEdit::Password);
        lkError = new QLabel;
        lkError->setStyleSheet("color: #d33");
        lkError->setWordWrap(true);
        sysBtn = new QPushButton;
        modeBtn = new QPushButton;
        modeBtn->setFlat(true);
        for (QWidget *w : {static_cast<QWidget *>(email), static_cast<QWidget *>(secret), static_cast<QWidget *>(sysBtn),
                           static_cast<QWidget *>(modeBtn), static_cast<QWidget *>(lkError)})
            ll->addWidget(w);
        stack->addWidget(lk);  // 1
        stack->addWidget(new QLabel("…"));  // 2

        auto *foot = new QHBoxLayout;
        foot->setContentsMargins(10, 6, 10, 6);
        openBtn = new QPushButton;
        openBtn->setFlat(true);
        lockBtn = new QPushButton;
        lockBtn->setFlat(true);
        foot->addWidget(openBtn);
        foot->addStretch();
        foot->addWidget(lockBtn);
        root->addLayout(foot);

        connect(search, &QLineEdit::textChanged, this, [this] { doSearch(); });
        connect(search, &QLineEdit::returnPressed, this, [this] { if (!items.isEmpty()) copy(items.first().toObject(), "pass"); });
        connect(secret, &QLineEdit::returnPressed, this, [this] { unlockSecret(); });
        connect(sysBtn, &QPushButton::clicked, this, [this] { unlock("system", ""); });
        connect(modeBtn, &QPushButton::clicked, this, [this] { usePassword = !usePassword; paintLocked(); });
        connect(openBtn, &QPushButton::clicked, this, [this] { send("open", {}, nullptr); hide(); });
        connect(lockBtn, &QPushButton::clicked, this, [this] { send("lock", {}, nullptr); reset(); });
    }

    void send(const QString &cmd, const QJsonObject &arg, Reply cb) {
        pending[++nextId] = cb;
        std::cout << QJsonDocument(QJsonObject{{"id", nextId}, {"cmd", cmd}, {"arg", arg}}).toJson(QJsonDocument::Compact).toStdString() << std::endl;
    }

    void onMessage(const QJsonObject &m) {
        if (m["event"].toString() == "toggle") return toggle(m["x"].toDouble(-1), m["y"].toDouble(-1));
        auto it = pending.find(m["id"].toInt());
        if (it == pending.end()) return;
        Reply cb = it->second;
        pending.erase(it);
        if (cb) cb(m["res"].toObject());
    }

protected:
    void keyPressEvent(QKeyEvent *e) override { if (e->key() == Qt::Key_Escape) hide(); else QWidget::keyPressEvent(e); }

private:
    QStackedWidget *stack; QLineEdit *search, *secret; QLabel *error, *lkError, *email; QListWidget *list;
    QPushButton *sysBtn, *modeBtn, *openBtn, *lockBtn;
    QNetworkAccessManager net;
    QHash<QString, QPixmap> cache;
    std::map<int, Reply> pending;
    QJsonArray items;
    QJsonObject st;
    int nextId = 0, seq = 0;
    bool usePassword = false, fr = false;

    QString t(const char *f, const char *e) const { return QString::fromUtf8(fr ? f : e); }

    void toggle(double x, double y) {
        if (isVisible()) { hide(); return; }
        QScreen *s = QGuiApplication::primaryScreen();
        if (x >= 0) {
            qreal dpr = devicePixelRatio();  // tray positions are physical pixels
            QPoint p(int(x / dpr), int(y / dpr));
            if (QScreen *at = QGuiApplication::screenAt(p)) s = at;
            QRect g = s->availableGeometry();
            int px = qBound(g.left() + 8, p.x() - width() / 2, g.right() - width() - 8);
            int py = p.y() > g.center().y() ? p.y() - height() - 8 : p.y() + 8;
            move(px, qBound(g.top() + 8, py, g.bottom() - height() - 8));
        } else {
            QRect g = s->availableGeometry();
            move(g.right() - width() - 12, g.top() + 12);
        }
        reset();
        show();
        raise();
        activateWindow();
    }

    void reset() {
        search->clear(); error->clear(); lkError->clear(); secret->clear();
        send("state", {}, [this](const QJsonObject &r) {
            st = r;
            fr = r["fr"].toBool();
            openBtn->setText(t("Ouvrir Lightwarden", "Open Lightwarden"));
            lockBtn->setText(t("Verrouiller", "Lock"));
            search->setPlaceholderText(t("Rechercher…", "Search…"));
            QString s = r["state"].toString();
            lockBtn->setVisible(s == "open");
            stack->setCurrentIndex(s == "open" ? 0 : s == "locked" ? 1 : 2);
            if (s == "open") { doSearch(); search->setFocus(); }
            else if (s == "locked") paintLocked();
        });
    }

    void paintLocked() {
        bool byPin = st["pin"].toBool() && !usePassword;
        email->setText(st["email"].toString());
        secret->setPlaceholderText(byPin ? t("Code PIN", "PIN") : t("Mot de passe maître", "Master password"));
        sysBtn->setText(t("Déverrouiller avec le système", "Unlock with system authentication"));
        sysBtn->setVisible(st["system"].toBool());
        modeBtn->setVisible(st["pin"].toBool());
        modeBtn->setText(byPin ? t("Utiliser le mot de passe maître", "Use master password") : t("Utiliser le PIN", "Use PIN"));
        secret->setFocus();
    }

    void unlockSecret() {
        bool byPin = st["pin"].toBool() && !usePassword;
        QString v = secret->text();
        secret->clear();
        unlock(byPin ? "pin" : "password", v);
    }

    void unlock(const QString &mode, const QString &value) {
        send("unlock", {{"mode", mode}, {"value", value}}, [this](const QJsonObject &r) {
            if (r.contains("error")) lkError->setText(r["error"].toString()); else reset();
        });
    }

    void doSearch() {
        int n = ++seq;
        send("search", {{"q", search->text()}}, [this, n](const QJsonObject &r) {
            if (n != seq) return;
            items = r["items"].toArray();
            list->clear();
            for (const QJsonValue &v : items) addRow(v.toObject());
        });
    }

    void copy(const QJsonObject &it, const QString &field) {
        send("copy", {{"id", it["id"]}, {"field", field}}, [this](const QJsonObject &r) {
            if (r.contains("error")) error->setText(r["error"].toString()); else hide();
        });
    }

    void addRow(const QJsonObject &it) {
        auto *w = new QWidget;
        auto *h = new QHBoxLayout(w);
        h->setContentsMargins(4, 2, 4, 2);
        auto *icon = new QLabel;
        icon->setFixedSize(24, 24);
        icon->setPixmap(QIcon::fromTheme("internet-web-browser").pixmap(22, 22));
        loadIcon(it["icon"].toString(), icon);
        auto *text = new QVBoxLayout;
        text->setSpacing(0);
        text->addWidget(new QLabel(it["name"].toString()));
        if (!it["user"].toString().isEmpty()) {
            auto *u = new QLabel(it["user"].toString());
            u->setEnabled(false);  // dimmed by the palette
            text->addWidget(u);
        }
        h->addWidget(icon);
        h->addLayout(text, 1);
        auto btn = [&](const char *theme, const QString &tip, const QString &field, const char *fallback) {
            auto *b = new QToolButton;
            b->setIcon(QIcon::fromTheme(theme));
            if (b->icon().isNull()) b->setText(fallback);
            b->setToolTip(tip);
            b->setAutoRaise(true);
            connect(b, &QToolButton::clicked, this, [this, it, field] { copy(it, field); });
            h->addWidget(b);
        };
        btn("user-identity", t("Copier l'identifiant", "Copy username"), "user", "U");
        btn("dialog-password", t("Copier le mot de passe", "Copy password"), "pass", "P");
        if (it["totp"].toBool()) btn("chronometer", t("Copier le code TOTP", "Copy TOTP code"), "totp", "T");
        auto *li = new QListWidgetItem(list);
        li->setSizeHint(QSize(0, 44));
        list->setItemWidget(li, w);
    }

    void loadIcon(const QString &url, QLabel *label) {
        if (url.isEmpty()) return;
        if (cache.contains(url)) { label->setPixmap(cache[url]); return; }
        QPointer<QLabel> l(label);
        QNetworkReply *rep = net.get(QNetworkRequest(QUrl(url)));
        connect(rep, &QNetworkReply::finished, this, [this, rep, l, url] {
            QPixmap px;
            if (rep->error() == QNetworkReply::NoError && px.loadFromData(rep->readAll())) {
                px = px.scaled(22, 22, Qt::KeepAspectRatio, Qt::SmoothTransformation);
                cache[url] = px;
                if (l) l->setPixmap(px);
            }
            rep->deleteLater();
        });
    }
};

int main(int argc, char **argv) {
    QApplication app(argc, argv);
    app.setQuitOnLastWindowClosed(false);
    Panel panel;
    // stdin is read on a thread; every message is handed to the GUI thread
    std::thread([&panel] {
        std::string line;
        while (std::getline(std::cin, line)) {
            QJsonObject m = QJsonDocument::fromJson(QByteArray::fromStdString(line)).object();
            QMetaObject::invokeMethod(&panel, [&panel, m] { panel.onMessage(m); }, Qt::QueuedConnection);
        }
        QMetaObject::invokeMethod(qApp, [] { qApp->quit(); }, Qt::QueuedConnection);  // the app closed the pipe
    }).detach();
    return app.exec();
}
