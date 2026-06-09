' @example: sugar/destructure-array/_expected/01-basic
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/destructure-array/01-basic
' @diagnostics: none
'
Imports mod_logger
Namespace mod_demo
   Class TDemo
      Public Sub Run(lista As CardRecordList)
         Dim first = lista.Item(0)
         Dim second = lista.Item(1)
         mod_logger.Printe(first.ToString() & " " & second.ToString())
      End Sub
   End Class
End Namespace
