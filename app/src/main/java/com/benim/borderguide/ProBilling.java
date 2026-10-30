package com.benim.borderguide;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.Collections;
import java.util.List;

/** Google Play tek seferlik "borderguide_pro" ürünü. */
final class ProBilling implements PurchasesUpdatedListener {
    static final String PRODUCT_ID = "borderguide_pro";

    interface Listener { void onProEvent(String event); }

    private final Activity activity;
    private final Listener listener;
    private final SharedPreferences sp;
    private final BillingClient client;
    private volatile ProductDetails details;

    ProBilling(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
        this.sp = activity.getSharedPreferences("pro", Context.MODE_PRIVATE);
        this.client = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
        connect(null);
    }

    private void connect(final Runnable then) {
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    queryProduct();
                    queryPurchases(false);
                    if (then != null) then.run();
                } else if (then != null) {
                    listener.onProEvent("noplay");
                }
            }

            @Override
            public void onBillingServiceDisconnected() { }
        });
    }

    boolean isPro() {
        return sp.getBoolean("pro", false);
    }

    String price() {
        ProductDetails d = details;
        if (d == null) return "";
        ProductDetails.OneTimePurchaseOfferDetails o = d.getOneTimePurchaseOfferDetails();
        return o == null ? "" : o.getFormattedPrice();
    }

    private void queryProduct() {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(PRODUCT_ID)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()))
                .build();
        client.queryProductDetailsAsync(params, (r, result) -> {
            if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && result != null) {
                List<ProductDetails> list = result.getProductDetailsList();
                if (list != null && !list.isEmpty()) details = list.get(0);
            }
            listener.onProEvent("ready");
        });
    }

    void queryPurchases(final boolean manual) {
        if (!client.isReady()) {
            if (manual) connect(() -> queryPurchases(true));
            return;
        }
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (r, purchases) -> {
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        if (manual) listener.onProEvent("fail");
                        return;
                    }
                    boolean found = false;
                    for (Purchase p : purchases) {
                        if (p.getProducts().contains(PRODUCT_ID) && p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                            found = true;
                            acknowledge(p);
                        }
                    }
                    setPro(found);
                    listener.onProEvent(manual ? (found ? "restored" : "none") : "sync");
                });
    }

    void buy() {
        if (!client.isReady()) {
            connect(this::launch);
            return;
        }
        launch();
    }

    private void launch() {
        ProductDetails d = details;
        if (d == null) {
            listener.onProEvent("noplay");
            return;
        }
        BillingFlowParams flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build()))
                .build();
        BillingResult r = client.launchBillingFlow(activity, flow);
        if (r.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) queryPurchases(true);
        else if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) listener.onProEvent("fail");
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase p : purchases) {
                if (!p.getProducts().contains(PRODUCT_ID)) continue;
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    setPro(true);
                    acknowledge(p);
                    listener.onProEvent("bought");
                } else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    listener.onProEvent("pending");
                }
            }
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            queryPurchases(true);
        } else if (code != BillingClient.BillingResponseCode.USER_CANCELED) {
            listener.onProEvent("fail");
        }
    }

    private void acknowledge(Purchase p) {
        if (p.isAcknowledged()) return;
        client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), r -> { });
    }

    private void setPro(boolean v) {
        sp.edit().putBoolean("pro", v).apply();
    }

    void end() {
        client.endConnection();
    }
}
