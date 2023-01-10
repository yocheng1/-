// var template =
//   "<tr>" +
//   "<th>" +
//   "<strong>" +
//   Product +
//   "</strong>" +
//   "</th>" +
//   "<th>" +
//   "<strong>" +
//   Price +
//   "</strong>" +
//   "</th>" +
//   "</tr>";

var itemCount = 0;
//點擊按鈕 產品名和價格出現
$(".add-cart-large").on("click", function () {
  alert("商品已加入購物車，詳細請查看右邊側欄");
  $(".none").css("display", "none");
  itemCount++;
  console.log("1");
  var productName = $(this).parent(".title").children("h4").html();
  var productPrice = $(this).parent(".title").children(".price-big").html();
  $("#newArea_product").append(
    '<div id="product" class="rowAlign"><div id = "productName">' +
      productName +
      '</div ><div id="productPrice" class="rowAlign">' +
      productPrice +
      "</div></div>"
  );
  $("#item_quantity").html("<p>Items</p><p> *" + itemCount + "</p>");
});
1;
