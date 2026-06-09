' @example: diagnostics/instantiation-limit-exceeded/trigger
' @demonstrates: a generic template that recursively instantiates itself exceeds MAX_INSTANTIATIONS
' @diagnostics: instantiation-limit-exceeded@11
' @requires: emitted by the SugarTranspiler at build-time (Fase 6) when the worklist exceeds 10_000 instantiations; the live linter does not run the drain.
'
Namespace mod_demo

   ' Pathological recursion: Box<T> contains a Box<Box<T>> -- expanding
   ' it produces an unbounded chain of monomorphizations.
   Class Box<T>
      Public Inner As Box<Box<T>>
   End Class

   Class TDemo
      Public Sub Run()
         Dim _root As Box<Integer>
      End Sub
   End Class

End Namespace
