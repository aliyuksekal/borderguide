package com.benim.borderguide;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Hatırlatma bildirimlerini AlarmManager ile planlar; liste web tarafında hesaplanır. */
final class Reminders {
    static final String ACTION = "com.benim.borderguide.REMIND";
    private static final String PREFS = "reminders";

    private Reminders() { }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void save(Context c, String json) {
        prefs(c).edit().putString("list", json == null ? "[]" : json).apply();
        rescheduleAll(c);
    }

    private static Intent intentFor(Context c, String id) {
        return new Intent(c, ReminderReceiver.class)
                .setAction(ACTION)
                .setData(Uri.parse("borderguide://reminder/" + Uri.encode(id)));
    }

    static synchronized void rescheduleAll(Context c) {
        SharedPreferences sp = prefs(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        for (String id : sp.getStringSet("ids", Collections.<String>emptySet())) {
            PendingIntent old = PendingIntent.getBroadcast(c, 0, intentFor(c, id),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (old != null) {
                am.cancel(old);
                old.cancel();
            }
        }

        Set<String> fired = sp.getStringSet("fired", Collections.<String>emptySet());
        Set<String> ids = new HashSet<>();
        long now = System.currentTimeMillis();
        try {
            JSONArray arr = new JSONArray(sp.getString("list", "[]"));
            for (int i = 0; i < arr.length() && i < 200; i++) {
                JSONObject o = arr.getJSONObject(i);
                String id = o.optString("id", "");
                if (id.isEmpty() || fired.contains(id)) continue;
                long at = o.optLong("at", 0);
                if (at < now - 6L * 3600_000L) continue;
                if (at < now) at = now + 5_000L;
                Intent in = intentFor(c, id)
                        .putExtra("id", id)
                        .putExtra("title", o.optString("title", "BorderGuide"))
                        .putExtra("text", o.optString("text", ""));
                PendingIntent pi = PendingIntent.getBroadcast(c, 0, in,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                ids.add(id);
            }
        } catch (Exception ignored) { }
        sp.edit().putStringSet("ids", ids).apply();
    }

    static synchronized void markFired(Context c, String id) {
        SharedPreferences sp = prefs(c);
        Set<String> f = new HashSet<>(sp.getStringSet("fired", Collections.<String>emptySet()));
        f.add(id);
        if (f.size() > 500) f.clear();
        sp.edit().putStringSet("fired", f).apply();
    }
}
