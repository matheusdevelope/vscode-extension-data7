' @example: diagnostics/unterminated-block/trigger
' @demonstrates: bloco Sub sem End Sub emite erro estrutural local
' @diagnostics: unterminated-block@7
'
Namespace mod_unterminated_block
   Class C
      Sub Run()
         Print("x")
   End Class
End Namespace
